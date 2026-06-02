import { logger } from '@nagiyu/common';
import {
  NOTE_KNOWLEDGE_LOOKBACK,
  NOTE_MAX_PER_RUN,
  NOTE_MIN_SUMMARY_LENGTH,
} from '../constants.js';
import type { KnowledgeEntity } from '../entities/knowledge.entity.js';
import type { CreateNoteInput } from '../entities/note.entity.js';
import type { KnowledgeRepository } from '../repositories/knowledge.repository.interface.js';
import type { NoteRepository } from '../repositories/note.repository.interface.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';

export interface GenerateNotesParams {
  knowledgeRepo: KnowledgeRepository;
  noteRepo: NoteRepository;
  ulidFactory?: UlidFactory;
  /** 品質ゲート（Summary 最小文字数）。未指定時は NOTE_MIN_SUMMARY_LENGTH */
  minSummaryLength?: number;
  /** 1 実行で生成するノートの最大数。未指定時は NOTE_MAX_PER_RUN */
  maxPerRun?: number;
  /** ノート化候補としてスキャンする直近 KNOWLEDGE の件数。未指定時は NOTE_KNOWLEDGE_LOOKBACK */
  lookback?: number;
}

export interface GenerateNotesResult {
  generatedCount: number;
}

/**
 * 1 ユーザー × 1 キャラの KNOWLEDGE をノート化する（決定論的変換、LLM 不使用）。
 *
 * 勉強バッチ（Phase 5a）が貯めた KNOWLEDGE のうち「ノート化に値する高品質なもの」を
 * NOTE に昇格する。Phase 5c では LLM での文体整形は行わず、Topic / Summary / RawComment を
 * そのままプレゼント体験のノートに整形する（親密度に応じた文体変化は Phase 6+）。
 *
 * 昇格基準：
 * 1. まだノート化されていない（既存ノートの RelatedKnowledgeIds に含まれない）
 * 2. Summary が minSummaryLength 以上（薄い知識の乱発防止）
 *
 * なお「キャラのコメント（RawComment）が付いている」ことは KnowledgeMapper が
 * 非空を保証するため、KNOWLEDGE である時点で常に満たされる（本文に必ず添えられる）。
 */
export async function generateNotesForUser(
  userId: string,
  characterId: string,
  params: GenerateNotesParams
): Promise<GenerateNotesResult> {
  const {
    knowledgeRepo,
    noteRepo,
    ulidFactory = defaultUlidFactory,
    minSummaryLength = NOTE_MIN_SUMMARY_LENGTH,
    maxPerRun = NOTE_MAX_PER_RUN,
    lookback = NOTE_KNOWLEDGE_LOOKBACK,
  } = params;

  const [knowledgeList, existingNotes] = await Promise.all([
    knowledgeRepo.list(userId, characterId, lookback),
    noteRepo.list(userId, characterId),
  ]);

  // 既にノート化済みの Knowledge ID 集合
  const notedKnowledgeIds = new Set<string>();
  for (const note of existingNotes) {
    for (const kid of note.RelatedKnowledgeIds) {
      notedKnowledgeIds.add(kid);
    }
  }

  const candidates = knowledgeList.filter((k) =>
    isNoteWorthy(k, notedKnowledgeIds, minSummaryLength)
  );

  let generatedCount = 0;
  for (const knowledge of candidates) {
    if (generatedCount >= maxPerRun) break;
    try {
      const input: CreateNoteInput = {
        UserID: userId,
        CharacterID: characterId,
        NoteID: ulidFactory(),
        Title: buildNoteTitle(knowledge),
        Body: buildNoteBody(knowledge),
        RelatedKnowledgeIds: [knowledge.KnowledgeID],
        RelatedCategory: knowledge.RelatedCategory,
      };
      await noteRepo.put(input);
      generatedCount++;
    } catch (err) {
      logger.warn('[generate-note] ノート保存に失敗しました（スキップして継続）', {
        userId,
        characterId,
        knowledgeId: knowledge.KnowledgeID,
        err,
      });
    }
  }

  return { generatedCount };
}

function isNoteWorthy(
  knowledge: KnowledgeEntity,
  notedKnowledgeIds: Set<string>,
  minSummaryLength: number
): boolean {
  if (notedKnowledgeIds.has(knowledge.KnowledgeID)) return false;
  if (knowledge.Summary.trim().length < minSummaryLength) return false;
  return true;
}

function buildNoteTitle(knowledge: KnowledgeEntity): string {
  return knowledge.Topic.trim().replace(/[。、．,\n\r]+$/, '');
}

/**
 * 「これ、あなたのために調べたの」というプレゼント体験になるよう、
 * 要約本文にキャラのコメントを添える。
 */
function buildNoteBody(knowledge: KnowledgeEntity): string {
  const summary = knowledge.Summary.trim();
  const comment = knowledge.RawComment.trim();
  return `${summary}\n\n${comment}`;
}
