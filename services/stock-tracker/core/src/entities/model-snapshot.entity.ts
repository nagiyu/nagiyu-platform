/**
 * Stock Tracker Core - ModelSnapshot のキー
 *
 * ModelSnapshot 自体のビジネスオブジェクトは `forecast/types.ts` の `ModelSnapshotItem` を
 * そのまま使う。design.md §2.3 の ModelSnapshotItem と core（Phase 3-1）の実装がすでに
 * 同名・同形であり、DynamoDB の実装詳細（PK/SK）を含まない点も他のエンティティと同じ条件を
 * 満たすため、ここで別の写しは作らない。
 */
import type { Market, Question } from '../forecast/index.js';

/**
 * ModelSnapshot のビジネスキー
 */
export interface ModelSnapshotKey {
  question: Question;
  market: Market;
  date: string;
}
