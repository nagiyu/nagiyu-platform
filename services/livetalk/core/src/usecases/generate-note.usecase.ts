import { logger } from '@nagiyu/common';
import {
  NOTE_CANDIDATE_LOOKBACK,
  NOTE_CARE_THRESHOLD,
  NOTE_MAX_PER_RUN,
  WEB_FACT_NOTE_LIMIT,
} from '../constants.js';
import type { CreateNoteInput } from '../entities/note.entity.js';
import { NoteLetterSchema } from '../llm-client/schemas/note-letter.schema.js';
import type { ILLMClient } from '../llm-client/types.js';
import type { NoteRepository } from '../repositories/note.repository.interface.js';
import type { NoteSkipRepository } from '../repositories/note-skip.repository.interface.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { selectRecentWebFacts } from '../knowledge/recent-web-facts.js';
import { buildGenerateNotePrompt } from './generate-note.prompt.js';

export interface GenerateNotesParams {
  topicRepo: TopicRepository;
  noteRepo: NoteRepository;
  /** 「生成しない」判断の記録。判断後に WEB fact が増えない Topic の再評価を避ける */
  noteSkipRepo: NoteSkipRepository;
  llmClient: ILLMClient;
  characterName: string;
  /** ノート ID 採番に使う（テスト差し替え用）。既定は {@link defaultUlidFactory} */
  ulidFactory?: UlidFactory;
  now?: () => number;
  /** ノート化する Topic の care 閾値。未指定時は NOTE_CARE_THRESHOLD */
  careThreshold?: number;
  /** 1 実行で生成するノートの最大数。未指定時は NOTE_MAX_PER_RUN */
  maxPerRun?: number;
  /** ノート化候補としてスキャンする care 降順 Topic の件数。未指定時は NOTE_CANDIDATE_LOOKBACK */
  candidateLimit?: number;
}

export interface GenerateNotesResult {
  generatedCount: number;
}

/**
 * 1 ユーザー × 1 キャラの Topic から「手紙」ノートを生成する
 * （リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）。
 *
 * 旧 Note（Knowledge 昇格方式）を廃止し、Topic を参照する ShareLog に置き換える。
 * consolidate バッチで Topic が更新された直後（＝贈り時）に呼ばれる想定。
 *
 * 処理フロー：
 * 1. `topicRepo.listTopicHeadersByCareDesc` で care 降順に候補 Topic を取得する
 * 2. 既存ノートの TopicID 集合を作り、「1 Topic につき既存ノートがあれば作らない」で
 *    乱発を防ぐ
 * 3. 各候補を care 閾値・既ノート済み・WEB fact 0 件（贈る中身が無い）で安価に足切りする
 *    （care 降順スキャンのため、閾値未満に達したら以降も満たさない → break）
 * 4. LLM（`buildGenerateNotePrompt` + `NoteLetterSchema`）に SELF フック候補＋WEB 中身を渡し、
 *    「手紙」として合成させる。捏造禁止・センシティブ SELF 回避の判断はプロンプト側のルールで
 *    LLM に委ねる（このレイヤーでは判定しない）
 * 5. `skip=true` ならそのノートは作らず、判断時刻を記録して次候補へ。`skip=false` なら NOTE を保存する。
 *    LLM の判断は渡した中身で決まるため、記録があり、記録後に作成された WEB fact が無い Topic は
 *    LLM を呼ばずに飛ばす（期間では評価し直さない）。「作成」を基準にするのは、`observedAt` が
 *    読んだ素材の時刻であって fact が Topic に加わった時刻ではないため
 * 6. `maxPerRun` に達したら終了。各 Topic の失敗は fail-warn でスキップし継続する
 *
 * 中身（出典・最新の調べた内容）はここでは保存しない。詳細画面が参照先 Topic の最新を
 * 都度反映するため（贈った瞬間の Headline は不変・中身は生きる、design 参照）。
 */
export async function generateNotesForUser(
  userId: string,
  characterId: string,
  params: GenerateNotesParams
): Promise<GenerateNotesResult> {
  const {
    topicRepo,
    noteRepo,
    noteSkipRepo,
    llmClient,
    characterName,
    ulidFactory = defaultUlidFactory,
    now = () => Date.now(),
    careThreshold = NOTE_CARE_THRESHOLD,
    maxPerRun = NOTE_MAX_PER_RUN,
    candidateLimit = NOTE_CANDIDATE_LOOKBACK,
  } = params;

  const [candidates, existingNotes, skipRecords] = await Promise.all([
    topicRepo.listTopicHeadersByCareDesc(userId, characterId, candidateLimit),
    noteRepo.listAll(userId, characterId),
    // 記録が読めなくても評価は進められる（再評価が増えるだけ）ため、ノート生成自体は止めない
    noteSkipRepo.listAll(userId, characterId).catch((err: unknown) => {
      logger.warn('[generate-note] 生成しない判断の記録の取得に失敗しました（記録なしで継続）', {
        userId,
        characterId,
        err,
      });
      return [];
    }),
  ]);
  const decidedAtByTopicId = new Map(
    skipRecords.map((record) => [record.topicId, record.decidedAt])
  );

  // 既にノート化済みの Topic 集合（1 Topic につき既存ノートがあれば作らない＝乱発防止）
  const notedTopicIds = new Set(existingNotes.map((note) => note.topicId));

  let generatedCount = 0;
  for (const topic of candidates) {
    if (generatedCount >= maxPerRun) break;
    // care 降順スキャンのため、閾値未満に達したら以降の候補も満たさない
    if (topic.care < careThreshold) break;
    if (notedTopicIds.has(topic.topicId)) continue;

    try {
      // 判断に使う中身を読む前の時刻。読んだ後・保存前に増えた fact を次回の再評価対象に残す
      const judgedAt = now();
      const bundle = await topicRepo.getTopicBundle({
        userId,
        characterId,
        topicId: topic.topicId,
      });
      // WEB fact が無ければ贈る中身が無いのでスキップ
      if (bundle.webFacts.length === 0) continue;

      const previousDecidedAt = decidedAtByTopicId.get(topic.topicId);
      if (
        previousDecidedAt !== undefined &&
        !bundle.webFacts.some((fact) => fact.createdAt > previousDecidedAt)
      ) {
        continue;
      }

      const promptMessages = buildGenerateNotePrompt({
        characterName,
        subject: topic.subject,
        canonicalSummary: topic.canonicalSummary,
        selfFacts: bundle.selfFacts.map((f) => ({ text: f.text, provenance: f.provenance })),
        webFacts: selectRecentWebFacts(bundle.webFacts, WEB_FACT_NOTE_LIMIT).map((f) => ({
          text: f.text,
          sourceUrls: f.sourceUrls,
        })),
      });

      const result = await llmClient.chatStructured(promptMessages, NoteLetterSchema, {
        purpose: 'summarize',
      });

      if (result.skip) {
        await recordSkip(noteSkipRepo, { userId, characterId, topicId: topic.topicId, judgedAt });
        continue;
      }

      const input: CreateNoteInput = {
        userId,
        characterId,
        noteId: ulidFactory(now()),
        topicId: topic.topicId,
        subject: topic.subject,
        headline: result.headline,
      };
      await noteRepo.put(input);
      generatedCount++;
      // ノート化済みの Topic は以後候補から外れるため、残った記録は不要
      if (previousDecidedAt !== undefined) {
        await clearSkip(noteSkipRepo, { userId, characterId, topicId: topic.topicId });
      }
    } catch (err) {
      logger.warn('[generate-note] ノート生成に失敗しました（スキップして継続）', {
        userId,
        characterId,
        topicId: topic.topicId,
        err,
      });
    }
  }

  return { generatedCount };
}

/** 記録の失敗は評価の結果に影響しないため、警告のみで継続する */
async function recordSkip(
  noteSkipRepo: NoteSkipRepository,
  params: { userId: string; characterId: string; topicId: string; judgedAt: number }
): Promise<void> {
  const { userId, characterId, topicId, judgedAt } = params;
  try {
    await noteSkipRepo.put({ userId, characterId, topicId, decidedAt: judgedAt });
  } catch (err) {
    logger.warn('[generate-note] 生成しない判断の記録に失敗しました（スキップして継続）', {
      userId,
      characterId,
      topicId,
      err,
    });
  }
}

/** ノートは保存済みのため、記録の削除に失敗しても生成の成功は覆さない */
async function clearSkip(
  noteSkipRepo: NoteSkipRepository,
  params: { userId: string; characterId: string; topicId: string }
): Promise<void> {
  try {
    await noteSkipRepo.delete(params);
  } catch (err) {
    logger.warn('[generate-note] 生成しない判断の記録の削除に失敗しました（スキップして継続）', {
      ...params,
      err,
    });
  }
}
