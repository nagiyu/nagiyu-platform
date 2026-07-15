import { logger } from '@nagiyu/common';
import { NOTE_CANDIDATE_LOOKBACK, NOTE_CARE_THRESHOLD, NOTE_MAX_PER_RUN } from '../constants.js';
import type { CreateNoteInput } from '../entities/note.entity.js';
import { NoteLetterSchema } from '../llm-client/schemas/note-letter.schema.js';
import type { ILLMClient } from '../llm-client/types.js';
import type { NoteRepository } from '../repositories/note.repository.interface.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { formatJstMonthDay } from '../lib/format-date.js';
import { buildGenerateNotePrompt } from './generate-note.prompt.js';

export interface GenerateNotesParams {
  topicRepo: TopicRepository;
  noteRepo: NoteRepository;
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
 * 5. `skip=true` ならそのノートは作らず次候補へ。`skip=false` なら NOTE を保存する
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
    llmClient,
    characterName,
    ulidFactory = defaultUlidFactory,
    now = () => Date.now(),
    careThreshold = NOTE_CARE_THRESHOLD,
    maxPerRun = NOTE_MAX_PER_RUN,
    candidateLimit = NOTE_CANDIDATE_LOOKBACK,
  } = params;

  const [candidates, existingNotes] = await Promise.all([
    topicRepo.listTopicHeadersByCareDesc(userId, characterId, candidateLimit),
    noteRepo.listAll(userId, characterId),
  ]);

  // 既にノート化済みの Topic 集合（1 Topic につき既存ノートがあれば作らない＝乱発防止）
  const notedTopicIds = new Set(existingNotes.map((note) => note.TopicID));

  let generatedCount = 0;
  for (const topic of candidates) {
    if (generatedCount >= maxPerRun) break;
    // care 降順スキャンのため、閾値未満に達したら以降の候補も満たさない
    if (topic.Care < careThreshold) break;
    if (notedTopicIds.has(topic.TopicID)) continue;

    try {
      const bundle = await topicRepo.getTopicBundle({
        userId,
        characterId,
        topicId: topic.TopicID,
      });
      // WEB fact が無ければ贈る中身が無いのでスキップ
      if (bundle.webFacts.length === 0) continue;

      // 依頼フック（甲-1）は bundle.topic（getTopicBundle のベーステーブル読み）から取り出す。
      // GSI3 経由の topic（候補列挙）には投影されないため、必ずベーステーブル読みの bundle.topic を使う。
      const promptMessages = buildGenerateNotePrompt({
        characterName,
        subject: topic.Subject,
        canonicalSummary: topic.CanonicalSummary,
        selfFacts: bundle.selfFacts.map((f) => ({ text: f.Text, provenance: f.Provenance })),
        webFacts: bundle.webFacts.map((f) => ({ text: f.Text, sourceUrls: f.SourceUrls })),
        requestText: bundle.topic?.RequestText,
        requestedAtLabel:
          bundle.topic?.RequestedAt !== undefined
            ? formatJstMonthDay(bundle.topic.RequestedAt)
            : undefined,
      });

      const result = await llmClient.chatStructured(promptMessages, NoteLetterSchema, {
        purpose: 'summarize',
      });

      if (result.skip) continue;

      const input: CreateNoteInput = {
        UserID: userId,
        CharacterID: characterId,
        NoteID: ulidFactory(now()),
        TopicID: topic.TopicID,
        Subject: topic.Subject,
        Headline: result.headline,
      };
      await noteRepo.put(input);
      generatedCount++;
    } catch (err) {
      logger.warn('[generate-note] ノート生成に失敗しました（スキップして継続）', {
        userId,
        characterId,
        topicId: topic.TopicID,
        err,
      });
    }
  }

  return { generatedCount };
}
