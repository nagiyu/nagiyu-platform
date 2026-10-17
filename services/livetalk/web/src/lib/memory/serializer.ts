import type { SelfFactEntity } from '@nagiyu/livetalk-core';
import { encodeSelfFactId } from './memory-id';
import type { SelfFactListItem } from './types';

/**
 * SelfFactEntity を UI / API レスポンス用の DTO に変換する。
 *
 * PascalCase の DynamoDB エンティティを camelCase の DTO に落とし、
 * `id` には base64url エンコードした完全 SK を埋める。
 * `subject` は所属 Topic の主題（呼び出し側が Topic ヘッダから渡す）。
 */
export function toSelfFactListItem(entity: SelfFactEntity, subject: string): SelfFactListItem {
  return {
    id: encodeSelfFactId({
      userId: entity.userId,
      characterId: entity.characterId,
      topicId: entity.topicId,
      factId: entity.factId,
    }),
    topicId: entity.topicId,
    subject,
    text: entity.text,
    createdAt: entity.createdAt,
  };
}

/**
 * 一覧を作成日時の新しい順（降順）で安定ソートする。
 */
export function sortSelfFacts(items: SelfFactListItem[]): SelfFactListItem[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}
