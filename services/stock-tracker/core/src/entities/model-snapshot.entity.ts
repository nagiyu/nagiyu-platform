/**
 * Stock Tracker Core - ModelSnapshot のキー
 *
 * ModelSnapshot 自体のビジネスオブジェクトは `forecast/types.ts` の `ModelSnapshotItem` を
 * そのまま使う。DynamoDB の実装詳細（PK/SK）を含まない点は他のエンティティと同じ条件を
 * 満たしており、同じ形の写しを重複して定義しないため、ここでは別の型を作らない。
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
