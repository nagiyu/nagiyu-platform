import type { MemoryEntity } from '@nagiyu/livetalk-core';
import { encodeMemoryId } from './memory-id';
import type { MemoryListItem } from './types';

/**
 * MemoryEntity を UI / API レスポンス用の DTO に変換する。
 *
 * PascalCase の DynamoDB エンティティを camelCase の DTO に落とし、
 * `id` には base64url エンコードした完全 SK を埋める。
 */
export function toMemoryListItem(entity: MemoryEntity): MemoryListItem {
  return {
    id: encodeMemoryId({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      tier: entity.Tier,
      category: entity.Category,
      memoryId: entity.MemoryID,
    }),
    tier: entity.Tier,
    category: entity.Category,
    content: entity.Content,
    confidence: entity.Confidence,
    referencedCount: entity.ReferencedCount,
    lastReferencedAt: entity.LastReferencedAt,
    createdAt: entity.CreatedAt,
    updatedAt: entity.UpdatedAt,
  };
}

/**
 * 一覧を最終参照日時の新しい順（未参照は末尾）→ 作成日時の新しい順で安定ソートする。
 */
export function sortMemories(items: MemoryListItem[]): MemoryListItem[] {
  return [...items].sort((a, b) => {
    const aRef = a.lastReferencedAt ?? -1;
    const bRef = b.lastReferencedAt ?? -1;
    if (aRef !== bRef) return bRef - aRef;
    return b.createdAt - a.createdAt;
  });
}
