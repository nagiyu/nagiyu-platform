import type { Tier } from '@nagiyu/livetalk-core';

/**
 * 記憶 UI / API で受け渡しする Memory の DTO。
 *
 * DynamoDB の SK（`CHAR#<char>#MEM#<tier>#<category>#<ulid>`）は URL に乗せにくいため、
 * `id` には base64url エンコードした完全 SK を入れる（`lib/memory/memory-id.ts` 参照）。
 */
export interface MemoryListItem {
  /** base64url エンコードした完全 SK。API パスの `:id` に使う */
  id: string;
  tier: Tier;
  category: string;
  content: string;
  /** 信頼度スコア（0.0〜1.0） */
  confidence: number;
  referencedCount: number;
  /** 最終参照日時（Unix ms、未参照なら undefined） */
  lastReferencedAt?: number;
  createdAt: number;
  updatedAt: number;
}
