/**
 * 旧知識資材（Memory / Knowledge / InterestCategory）→ 新 Topic モデルへの
 * 一回性マイグレーション usecase（手動発火 Lambda 専用、throwaway コード）。
 *
 * core の legacy reader / 擬似ソース生成 / schema janitor / care seeder / consolidate を
 * 組み合わせて、1 ユーザー × 1 キャラごとに以下の順で処理する：
 * 1. dryRun → 件数レポートのみ（書き込み・LLM 呼び出し無し）
 * 2. wipe（非 dryRun）→ janitor で新スキーマ削除。`wipeNewFirst`（全削除）または
 *    `wipeNewCreatedAfter`（指定時刻以降のみ削除）のどちらか一方
 * 3. migrate（非 dryRun）→ 旧レコード読取 → 擬似ソース生成 → `chunkStart`/`chunkEnd` で
 *    指定された範囲のチャンクのみ consolidate() 実行
 *    → 今回の範囲が最終チャンクまで含む場合のみ care seed → 実 CURSOR を runNow にセット
 * 4. deleteOldAfter（非 dryRun & 同一実行内で migrate が「最終範囲」を処理して成功）
 *    → janitor で旧スキーマ削除
 *
 * `chunkStart`/`chunkEnd`（Issue #3814）は、本番 Lambda の 15 分タイムアウトを超える
 * 大きなスコープを複数回の呼び出しに分割するためのオプション。非同期 invoke の既定リトライ
 * （2 回）と組み合わさると冪等でない移行処理が重複実行されうるため、CDK 側でも
 * リトライは 0 に設定している（infra/livetalk/lib/batch-stack.ts）。
 *
 * 移行完了・Issue クローズ後は本ファイルを削除してよい。
 */
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger, toErrorMessage } from '@nagiyu/common';
import {
  getAllCharacterIds,
  getCharacterDefinitionById,
  readLegacyData,
  buildPseudoMessages,
  buildPseudoWebRaws,
  chunkPseudoSources,
  createChunkRepos,
  computeCareBoosts,
  applyCareBoosts,
  findSchemaItems,
  deleteSchemaItems,
  findSchemaItemsCreatedAfter,
  deleteSchemaItemsCreatedAfter,
  consolidate,
  DynamoDBConsolidationCursorRepository,
  MIGRATION_CHUNK_SIZE,
  MIGRATION_SELF_FACT_PROVENANCE_SUFFIX,
  type TopicRepository,
  type ProfileRepository,
  type ILLMClient,
  type IEmbeddingClient,
  type UlidFactory,
} from '@nagiyu/livetalk-core';

/** 一回性移行のエラーメッセージ定数（日本語） */
export const MIGRATE_ERROR_MESSAGES = {
  本番未確認: '一回性移行: 本番環境での破壊的操作には confirmEnv="prod" の指定が必要です',
  不正なチャンク範囲:
    '一回性移行: チャンク範囲の指定が不正です（chunkStart は 0 以上の整数、chunkEnd を指定する場合は chunkStart より大きい整数である必要があります）',
  不正な日時形式:
    '一回性移行: wipeNewCreatedAfter の日時形式が不正です（ISO 8601 形式で指定してください）',
  wipeオプション同時指定: '一回性移行: wipeNewFirst と wipeNewCreatedAfter は同時に指定できません',
} as const;

/** Lambda 手動 invoke ペイロード。 */
export interface MigratePayload {
  /** 対象ユーザー ID。'ALL' で全ユーザー。 */
  targetUserId: string;
  /** 対象キャラクター ID。省略時は登録済み全キャラクター。 */
  characterId?: string;
  /** 新スキーマを先に全削除する（dev を旧only へ戻す用）。既定 false。`wipeNewCreatedAfter` とは
   * 同時指定不可。 */
  wipeNewFirst?: boolean;
  /**
   * 新スキーマのうち `CreatedAt` が指定時刻（ISO 8601、例 "2026-09-23T14:33:53Z"）以降の
   * アイテムのみを先に削除する（タイムアウトで重複生成された新スキーマの後片付け用）。
   * `wipeNewFirst` とは同時指定不可。
   */
  wipeNewCreatedAfter?: string;
  /** 旧→新の変換を実行する。既定 true。 */
  migrate?: boolean;
  /**
   * consolidate() に流すチャンクの開始位置（0 始まり・含む）。既定 0。
   * Lambda のタイムアウトを避けるため、1 スコープを複数回の呼び出しに分割する用途。
   */
  chunkStart?: number;
  /**
   * consolidate() に流すチャンクの終了位置（含まない）。既定は全チャンク数。
   * `chunkEnd` が全チャンク数以上（＝最終チャンクまで含む）の呼び出しでのみ、
   * care 引き継ぎと実 CURSOR の前進を行う。
   */
  chunkEnd?: number;
  /** 旧スキーマを移行成功後に削除する。既定 false。 */
  deleteOldAfter?: boolean;
  /** 書き込み・LLM 呼び出しを行わずレポートのみ返す。既定 true。 */
  dryRun?: boolean;
  /** 本番環境での破壊的操作を許可する明示的な確認値（本番のみ必須、"prod" 固定）。 */
  confirmEnv?: string;
}

export interface MigrateScopeReport {
  userId: string;
  characterId: string;
  dryRun: boolean;
  /** 旧スキーマの読み取り件数（パース成功分） */
  legacyMemoryCount: number;
  legacyKnowledgeCount: number;
  legacyInterestCount: number;
  /** 生成予定・生成した擬似ソース件数 */
  pseudoMessageCount: number;
  pseudoWebRawCount: number;
  /** 今回の呼び出しで対象となったチャンク範囲（解決後・クランプ後の値） */
  chunkStart: number;
  chunkEnd: number;
  /** 今回の範囲に含まれるチャンク数（予定）。旧 `chunkStart`/`chunkEnd` 未指定時は全チャンク数と一致 */
  plannedChunkCount: number;
  consolidatedChunkCount: number;
  /** 新スキーマの対象件数（wipeNewFirst 指定時、または dryRun 時に算出） */
  newSchemaItemCount: number;
  /** 旧スキーマの対象件数（deleteOldAfter 指定時、または dryRun 時に算出） */
  oldSchemaItemCount: number;
  /** wipeNewCreatedAfter 指定時の対象件数（dryRun は削除予定件数、非 dryRun は削除件数） */
  wipeNewCreatedAfterCount: number;
  wiped: boolean;
  wipedCount: number;
  migrated: boolean;
  /** 実 CURSOR を runNow へ前進させたか（旧資材ありスコープのみ true）。 */
  cursorAdvanced: boolean;
  careAppliedCount: number;
  careSkippedCount: number;
  deletedOld: boolean;
  deletedOldCount: number;
  error?: string;
}

export interface MigrateResult {
  processedScopes: number;
  failedScopes: number;
  failedScopeKeys: string[];
  scopeReports: MigrateScopeReport[];
}

interface ResolvedFlags {
  dryRun: boolean;
  migrate: boolean;
  wipeNewFirst: boolean;
  deleteOldAfter: boolean;
  /** ISO 文字列をエポックミリ秒へ解決した値。未指定なら undefined。 */
  wipeNewCreatedAfterMs?: number;
  /** 0 始まり・含む。未指定時は 0。 */
  chunkStart: number;
  /** 含まない。未指定時は undefined（＝スコープごとの全チャンク数を用いる）。 */
  chunkEnd?: number;
}

/**
 * ペイロードを解決済みフラグへ変換する。入力バリデーション（チャンク範囲の整合性・
 * wipeNewCreatedAfter の日時形式・wipeNewFirst との同時指定禁止）もここで行い、
 * 不正な場合は fatal（全スコープ未処理のまま throw）とする。スコープごとのチャンク数に
 * 依存しない、ペイロード単体で判定できる誤りのため、スコープ処理前に一括で弾く。
 */
function resolveFlags(payload: MigratePayload): ResolvedFlags {
  if (payload.wipeNewFirst && payload.wipeNewCreatedAfter !== undefined) {
    throw new Error(MIGRATE_ERROR_MESSAGES.wipeオプション同時指定);
  }

  const chunkStart = payload.chunkStart ?? 0;
  if (!Number.isInteger(chunkStart) || chunkStart < 0) {
    throw new Error(MIGRATE_ERROR_MESSAGES.不正なチャンク範囲);
  }
  const { chunkEnd } = payload;
  if (chunkEnd !== undefined && (!Number.isInteger(chunkEnd) || chunkEnd <= chunkStart)) {
    throw new Error(MIGRATE_ERROR_MESSAGES.不正なチャンク範囲);
  }

  let wipeNewCreatedAfterMs: number | undefined;
  if (payload.wipeNewCreatedAfter !== undefined) {
    const parsed = Date.parse(payload.wipeNewCreatedAfter);
    if (Number.isNaN(parsed)) {
      throw new Error(MIGRATE_ERROR_MESSAGES.不正な日時形式);
    }
    wipeNewCreatedAfterMs = parsed;
  }

  return {
    dryRun: payload.dryRun ?? true,
    migrate: payload.migrate ?? true,
    wipeNewFirst: payload.wipeNewFirst ?? false,
    deleteOldAfter: payload.deleteOldAfter ?? false,
    wipeNewCreatedAfterMs,
    chunkStart,
    chunkEnd,
  };
}

function isDestructiveRequested(flags: ResolvedFlags): boolean {
  if (flags.dryRun) return false;
  return (
    flags.wipeNewFirst ||
    flags.migrate ||
    flags.deleteOldAfter ||
    flags.wipeNewCreatedAfterMs !== undefined
  );
}

/**
 * 本番環境（`LIVETALK_ENV` または `NODE_ENV` が `prod`）での破壊的操作には
 * `confirmEnv==='prod'` の明示指定を必須とする。dev 環境では不要。
 */
function assertEnvGuard(flags: ResolvedFlags, env: string, confirmEnv: string | undefined): void {
  if (!isDestructiveRequested(flags)) return;
  if (env === 'prod' && confirmEnv !== 'prod') {
    throw new Error(MIGRATE_ERROR_MESSAGES.本番未確認);
  }
}

function emptyReport(userId: string, characterId: string, dryRun: boolean): MigrateScopeReport {
  return {
    userId,
    characterId,
    dryRun,
    legacyMemoryCount: 0,
    legacyKnowledgeCount: 0,
    legacyInterestCount: 0,
    pseudoMessageCount: 0,
    pseudoWebRawCount: 0,
    chunkStart: 0,
    chunkEnd: 0,
    plannedChunkCount: 0,
    consolidatedChunkCount: 0,
    newSchemaItemCount: 0,
    oldSchemaItemCount: 0,
    wipeNewCreatedAfterCount: 0,
    wiped: false,
    wipedCount: 0,
    migrated: false,
    cursorAdvanced: false,
    careAppliedCount: 0,
    careSkippedCount: 0,
    deletedOld: false,
    deletedOldCount: 0,
  };
}

interface MigrateScopeDeps {
  docClient: DynamoDBDocumentClient;
  tableName: string;
  topicRepo: TopicRepository;
  llmClient: ILLMClient;
  embeddingClient: IEmbeddingClient;
  now: () => number;
  ulidFactory?: UlidFactory;
}

/**
 * 1 ユーザー × 1 キャラ分の移行処理。処理順序は本ファイル冒頭のコメントの通り。
 */
async function migrateScope(
  userId: string,
  characterId: string,
  characterName: string,
  flags: ResolvedFlags,
  deps: MigrateScopeDeps
): Promise<MigrateScopeReport> {
  const runNow = deps.now();
  const report = emptyReport(userId, characterId, flags.dryRun);

  const legacy = await readLegacyData(deps.docClient, deps.tableName, userId, characterId);
  report.legacyMemoryCount = legacy.memories.length;
  report.legacyKnowledgeCount = legacy.knowledge.length;
  report.legacyInterestCount = legacy.interests.length;

  const pseudoMessages = buildPseudoMessages(
    legacy.memories,
    userId,
    characterId,
    runNow,
    deps.ulidFactory
  );
  const pseudoWebRaws = buildPseudoWebRaws(
    legacy.knowledge,
    userId,
    characterId,
    runNow,
    deps.ulidFactory
  );
  report.pseudoMessageCount = pseudoMessages.length;
  report.pseudoWebRawCount = pseudoWebRaws.length;

  const chunks = chunkPseudoSources(pseudoMessages, pseudoWebRaws, MIGRATION_CHUNK_SIZE);
  const totalChunkCount = chunks.length;

  // チャンク範囲（chunkStart/chunkEnd）の解決。
  // 旧データの読み取り順（readLegacyData → buildPseudoMessages/buildPseudoWebRaws →
  // chunkPseudoSources）は決定的であるという前提を置いている（同じ旧データであれば、
  // 何度呼び出しても同じチャンク分割になる）。この前提が崩れると、分割実行した各呼び出しが
  // 異なるチャンク境界を見てしまい、一部のチャンクが処理漏れ・重複処理される可能性がある。
  // 範囲がそのスコープのチャンク数を超える場合はクランプする（旧資材が少ない・無いスコープを
  // 失敗させないため）。
  const resolvedChunkStart = Math.min(flags.chunkStart, totalChunkCount);
  const resolvedChunkEnd =
    flags.chunkEnd !== undefined ? Math.min(flags.chunkEnd, totalChunkCount) : totalChunkCount;
  const targetChunks = chunks.slice(resolvedChunkStart, resolvedChunkEnd);
  // 今回の範囲が最終チャンクまで含むか（＝care 引き継ぎ・実 CURSOR 前進を行ってよい範囲か）。
  const isFinalChunkRange = resolvedChunkEnd >= totalChunkCount;

  report.chunkStart = resolvedChunkStart;
  report.chunkEnd = resolvedChunkEnd;
  report.plannedChunkCount = targetChunks.length;

  if (flags.wipeNewFirst || flags.dryRun) {
    const newItems = await findSchemaItems(
      deps.docClient,
      deps.tableName,
      userId,
      characterId,
      'new'
    );
    report.newSchemaItemCount = newItems.length;
  }
  if (flags.deleteOldAfter || flags.dryRun) {
    const oldItems = await findSchemaItems(
      deps.docClient,
      deps.tableName,
      userId,
      characterId,
      'old'
    );
    report.oldSchemaItemCount = oldItems.length;
  }
  if (flags.wipeNewCreatedAfterMs !== undefined) {
    const wipeCandidates = await findSchemaItemsCreatedAfter(
      deps.docClient,
      deps.tableName,
      userId,
      characterId,
      'new',
      flags.wipeNewCreatedAfterMs
    );
    report.wipeNewCreatedAfterCount = wipeCandidates.length;
  }

  if (flags.dryRun) {
    logger.info('[migrate] dryRun レポート', { ...report });
    return report;
  }

  if (flags.wipeNewFirst) {
    const { deletedCount } = await deleteSchemaItems(
      deps.docClient,
      deps.tableName,
      userId,
      characterId,
      'new'
    );
    report.wiped = true;
    report.wipedCount = deletedCount;
  } else if (flags.wipeNewCreatedAfterMs !== undefined) {
    const { deletedCount } = await deleteSchemaItemsCreatedAfter(
      deps.docClient,
      deps.tableName,
      userId,
      characterId,
      'new',
      flags.wipeNewCreatedAfterMs
    );
    report.wiped = true;
    report.wipedCount = deletedCount;
    report.wipeNewCreatedAfterCount = deletedCount;
  }

  if (flags.migrate) {
    for (const chunk of targetChunks) {
      const chunkRepos = createChunkRepos(chunk.messages, chunk.webRaws);
      await consolidate(userId, characterId, {
        topicRepo: deps.topicRepo,
        messageRepo: chunkRepos.messageRepo,
        webRawRepo: chunkRepos.webRawRepo,
        cursorRepo: chunkRepos.cursorRepo,
        llmClient: deps.llmClient,
        embeddingClient: deps.embeddingClient,
        characterName,
        now: () => runNow,
        ulidFactory: deps.ulidFactory,
        selfFactProvenanceSuffix: MIGRATION_SELF_FACT_PROVENANCE_SUFFIX,
      });
      report.consolidatedChunkCount++;
    }

    if (isFinalChunkRange) {
      // care 引き継ぎ（今回の範囲が最終チャンクまで含む場合のみ、1 ユーザー×キャラ単位）
      const topics = await deps.topicRepo.listTopicHeaders(userId, characterId);
      const boosts = computeCareBoosts(topics, legacy.interests, legacy.memories);
      const careResult = await applyCareBoosts(deps.topicRepo, userId, characterId, topics, boosts);
      report.careAppliedCount = careResult.appliedCount;
      report.careSkippedCount = careResult.skippedCount;

      // 実 CURSOR を runNow にセットし、次回 consolidation が実メッセージを再度畳んで
      // 重複 Topic を作るのを防ぐ。
      // ただし前進させるのは「旧資材があった（＝擬似ソースを consolidate に流した）スコープ」に
      // 限定する。旧資材ゼロのスコープで前進させると、そのユーザーの未集約実メッセージが正常系
      // consolidation から永久に取りこぼされる（純粋な副作用）ため、totalChunkCount が 0 なら
      // 据え置く。
      if (totalChunkCount > 0) {
        const realCursorRepo = new DynamoDBConsolidationCursorRepository(
          deps.docClient,
          deps.tableName
        );
        const existingCursor = await realCursorRepo.get(userId, characterId);
        await realCursorRepo.put(
          { UserID: userId, CharacterID: characterId, MsgCursor: runNow, WebrawCursor: runNow },
          existingCursor ? { expectedUpdatedAt: existingCursor.UpdatedAt } : {}
        );
        report.cursorAdvanced = true;
      }

      report.migrated = true;
    } else {
      // 途中範囲（chunkEnd がまだ全チャンク数に達していない）の実行。次回以降の呼び出しで
      // 続きのチャンクを処理する前提のため、care 引き継ぎ・実 CURSOR 前進・deleteOldAfter は
      // 最終範囲の呼び出しまでスキップする。
      logger.info(
        '[migrate] 分割実行の途中範囲を処理しました（care 引き継ぎ・CURSOR 前進はスキップ）',
        {
          userId,
          characterId,
          chunkStart: resolvedChunkStart,
          chunkEnd: resolvedChunkEnd,
          totalChunkCount,
        }
      );
    }
  }

  if (flags.deleteOldAfter) {
    if (!flags.migrate || !report.migrated) {
      logger.warn(
        '[migrate] deleteOldAfter が指定されましたが、同一実行内で migrate が成功しなかったためスキップします',
        { userId, characterId }
      );
    } else {
      const { deletedCount } = await deleteSchemaItems(
        deps.docClient,
        deps.tableName,
        userId,
        characterId,
        'old'
      );
      report.deletedOld = true;
      report.deletedOldCount = deletedCount;
    }
  }

  return report;
}

export interface RunMigrationParams {
  payload: MigratePayload;
  profileRepo: ProfileRepository;
  docClient: DynamoDBDocumentClient;
  tableName: string;
  topicRepo: TopicRepository;
  llmClient: ILLMClient;
  embeddingClient: IEmbeddingClient;
  /** `LIVETALK_ENV`/`NODE_ENV` の解決値。テスト差し替え用。既定は process.env から解決する。 */
  env?: string;
  now?: () => number;
  ulidFactory?: UlidFactory;
}

/**
 * 一回性マイグレーションのトップレベル orchestration。
 * targetUserId='ALL' は ProfileRepository.listAllUserIds で全ユーザーを列挙し、
 * 単一指定はその 1 件のみを処理する。characterId 省略時は登録済み全キャラクターを走査する。
 * 1 スコープ（ユーザー×キャラ）の失敗は他スコープの処理を止めない（fail-warn）。
 */
export async function runMigration(params: RunMigrationParams): Promise<MigrateResult> {
  const {
    payload,
    profileRepo,
    docClient,
    tableName,
    topicRepo,
    llmClient,
    embeddingClient,
    env = process.env.LIVETALK_ENV || process.env.NODE_ENV || '',
    now = () => Date.now(),
    ulidFactory,
  } = params;

  const flags = resolveFlags(payload);
  assertEnvGuard(flags, env, payload.confirmEnv);

  const userIds =
    payload.targetUserId === 'ALL' ? await profileRepo.listAllUserIds() : [payload.targetUserId];
  const characterIds = payload.characterId ? [payload.characterId] : getAllCharacterIds();

  logger.info('[migrate] 移行バッチ開始', {
    userCount: userIds.length,
    characterCount: characterIds.length,
    flags,
  });

  const result: MigrateResult = {
    processedScopes: 0,
    failedScopes: 0,
    failedScopeKeys: [],
    scopeReports: [],
  };

  for (const userId of userIds) {
    for (const characterId of characterIds) {
      const characterDef = getCharacterDefinitionById(characterId);
      if (!characterDef) {
        logger.warn('[migrate] キャラクター定義が見つかりません（スキップ）', { characterId });
        continue;
      }

      try {
        const report = await migrateScope(userId, characterId, characterDef.displayName, flags, {
          docClient,
          tableName,
          topicRepo,
          llmClient,
          embeddingClient,
          now,
          ulidFactory,
        });
        result.scopeReports.push(report);
        result.processedScopes++;
      } catch (error) {
        const message = toErrorMessage(error);
        logger.warn('[migrate] スコープ処理失敗（他スコープは継続）', {
          userId,
          characterId,
          error: message,
        });
        result.failedScopes++;
        result.failedScopeKeys.push(`${userId}#${characterId}`);
        result.scopeReports.push({
          ...emptyReport(userId, characterId, flags.dryRun),
          error: message,
        });
      }
    }
  }

  logger.info('[migrate] 移行バッチ完了', {
    processedScopes: result.processedScopes,
    failedScopes: result.failedScopes,
  });

  return result;
}
