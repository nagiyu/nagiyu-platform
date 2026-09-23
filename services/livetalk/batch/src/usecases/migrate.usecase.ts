/**
 * 旧知識資材（Memory / Knowledge / InterestCategory）→ 新 Topic モデルへの
 * 一回性マイグレーション usecase（手動発火 Lambda 専用、throwaway コード）。
 *
 * core の legacy reader / 擬似ソース生成 / schema janitor / care seeder / consolidate を
 * 組み合わせて、1 ユーザー × 1 キャラごとに以下の順で処理する：
 * 1. dryRun → 件数レポートのみ（書き込み・LLM 呼び出し無し）
 * 2. wipeNewFirst（非 dryRun）→ janitor で新スキーマ削除
 * 3. migrate（非 dryRun）→ 旧レコード読取 → 擬似ソース生成 → チャンク単位で consolidate() 実行
 *    → care seed → 実 CURSOR を runNow にセット
 * 4. deleteOldAfter（非 dryRun & migrate 成功）→ janitor で旧スキーマ削除
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
} as const;

/** Lambda 手動 invoke ペイロード。 */
export interface MigratePayload {
  /** 対象ユーザー ID。'ALL' で全ユーザー。 */
  targetUserId: string;
  /** 対象キャラクター ID。省略時は登録済み全キャラクター。 */
  characterId?: string;
  /** 新スキーマを先に全削除する（dev を旧only へ戻す用）。既定 false。 */
  wipeNewFirst?: boolean;
  /** 旧→新の変換を実行する。既定 true。 */
  migrate?: boolean;
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
  /** consolidate() に流すチャンク数（予定/実行済み） */
  plannedChunkCount: number;
  consolidatedChunkCount: number;
  /** 新スキーマの対象件数（wipeNewFirst 指定時、または dryRun 時に算出） */
  newSchemaItemCount: number;
  /** 旧スキーマの対象件数（deleteOldAfter 指定時、または dryRun 時に算出） */
  oldSchemaItemCount: number;
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
}

function resolveFlags(payload: MigratePayload): ResolvedFlags {
  return {
    dryRun: payload.dryRun ?? true,
    migrate: payload.migrate ?? true,
    wipeNewFirst: payload.wipeNewFirst ?? false,
    deleteOldAfter: payload.deleteOldAfter ?? false,
  };
}

function isDestructiveRequested(flags: ResolvedFlags): boolean {
  if (flags.dryRun) return false;
  return flags.wipeNewFirst || flags.migrate || flags.deleteOldAfter;
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
    plannedChunkCount: 0,
    consolidatedChunkCount: 0,
    newSchemaItemCount: 0,
    oldSchemaItemCount: 0,
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
  report.plannedChunkCount = chunks.length;

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
  }

  if (flags.migrate) {
    for (const chunk of chunks) {
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

    // care 引き継ぎ（全チャンク consolidation 後、1 ユーザー×キャラ単位）
    const topics = await deps.topicRepo.listTopicHeaders(userId, characterId);
    const boosts = computeCareBoosts(topics, legacy.interests, legacy.memories);
    const careResult = await applyCareBoosts(deps.topicRepo, userId, characterId, topics, boosts);
    report.careAppliedCount = careResult.appliedCount;
    report.careSkippedCount = careResult.skippedCount;

    // 実 CURSOR を runNow にセットし、次回 consolidation が実メッセージを再度畳んで
    // 重複 Topic を作るのを防ぐ。
    // ただし前進させるのは「旧資材があった（＝擬似ソースを consolidate に流した）スコープ」に
    // 限定する。旧資材ゼロのスコープで前進させると、そのユーザーの未集約実メッセージが正常系
    // consolidation から永久に取りこぼされる（純粋な副作用）ため、chunks が空なら据え置く。
    if (chunks.length > 0) {
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
