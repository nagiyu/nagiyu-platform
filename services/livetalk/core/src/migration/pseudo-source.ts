/**
 * 旧 Memory / 旧 Knowledge から擬似ソース（擬似メッセージ / 擬似 webraw）を生成する
 * ユーティリティ（一回性マイグレーション専用の throwaway コード）。
 *
 * 擬似ソースは永続化しない。consolidate() へチャンク単位で流し込むための
 * in-memory 専用データであり、DynamoDB へは一切書き込まない。
 */
import type { MessageEntity } from '../entities/message.entity.js';
import type { WebRawEntity } from '../entities/webraw.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import type { LegacyKnowledgeEntity, LegacyMemoryEntity } from './legacy-types.js';

/**
 * 旧 Memory 群から擬似メッセージ（`Role: 'user'`）を生成する。
 * Tier/Confidence は捨てる（consolidate の B厳格化で汚染を吸収するため追加フィルタは行わない）。
 * `CreatedAt` は `baseTimestamp` からの連番で単調増加させる（consolidate の
 * `listSince`/カーソル計算が時系列ソートを前提とするため）。
 */
export function buildPseudoMessages(
  memories: LegacyMemoryEntity[],
  userId: string,
  characterId: string,
  baseTimestamp: number,
  ulidFactory: UlidFactory = defaultUlidFactory
): MessageEntity[] {
  return memories.map((memory, index) => {
    const createdAt = baseTimestamp + index;
    return {
      UserID: userId,
      CharacterID: characterId,
      MessageID: ulidFactory(createdAt),
      Role: 'user',
      Text: memory.Content,
      CreatedAt: createdAt,
      UpdatedAt: createdAt,
    };
  });
}

/**
 * 旧 Knowledge 群から擬似 webraw を生成する。
 * `RawComment` があれば `Summary` に併記する。
 */
export function buildPseudoWebRaws(
  knowledgeItems: LegacyKnowledgeEntity[],
  userId: string,
  characterId: string,
  baseTimestamp: number,
  ulidFactory: UlidFactory = defaultUlidFactory
): WebRawEntity[] {
  return knowledgeItems.map((knowledge, index) => {
    const createdAt = baseTimestamp + index;
    const rawText = knowledge.RawComment
      ? `${knowledge.Summary}\n${knowledge.RawComment}`
      : knowledge.Summary;
    return {
      UserID: userId,
      CharacterID: characterId,
      RawID: ulidFactory(createdAt),
      Query: knowledge.Topic,
      RawText: rawText,
      SourceUrls: knowledge.SourceUrls,
      CreatedAt: createdAt,
    };
  });
}

/** チャンク単位の擬似ソース（1 回の consolidate() 呼び出し分）。 */
export interface PseudoSourceChunk {
  messages: MessageEntity[];
  webRaws: WebRawEntity[];
}

type TaggedPseudoSource =
  | { kind: 'message'; entity: MessageEntity }
  | { kind: 'webraw'; entity: WebRawEntity };

/**
 * 擬似メッセージ・擬似 webraw を結合ストリームとして `chunkSize` 件ずつのチャンクに分割する。
 * 実 topicRepo をチャンク間で共有することで、後続チャンクが前チャンク生成の Topic に
 * merge（名寄せ）できるようにする（呼び出し側の責務）。
 */
export function chunkPseudoSources(
  messages: MessageEntity[],
  webRaws: WebRawEntity[],
  chunkSize: number
): PseudoSourceChunk[] {
  const combined: TaggedPseudoSource[] = [
    ...messages.map((entity): TaggedPseudoSource => ({ kind: 'message', entity })),
    ...webRaws.map((entity): TaggedPseudoSource => ({ kind: 'webraw', entity })),
  ];

  const chunks: PseudoSourceChunk[] = [];
  for (let i = 0; i < combined.length; i += chunkSize) {
    const slice = combined.slice(i, i + chunkSize);
    chunks.push({
      messages: slice
        .filter((s): s is Extract<TaggedPseudoSource, { kind: 'message' }> => s.kind === 'message')
        .map((s) => s.entity),
      webRaws: slice
        .filter((s): s is Extract<TaggedPseudoSource, { kind: 'webraw' }> => s.kind === 'webraw')
        .map((s) => s.entity),
    });
  }

  return chunks;
}
