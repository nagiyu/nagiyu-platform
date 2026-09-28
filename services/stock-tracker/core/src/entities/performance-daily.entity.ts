/**
 * Stock Tracker Core - PerformanceDaily のキー
 *
 * PerformanceDaily 自体のビジネスオブジェクトは `forecast/performance.ts` の
 * `PerformanceDailyItem` をそのまま使う（ModelSnapshot と同じ理由。DB の実装詳細を持たない
 * 集計値の型そのものが core にあるため、別の写しは作らない）。
 */
import type { Market, Question } from '../forecast/index.js';

/**
 * PerformanceDaily のビジネスキー
 */
export interface PerformanceDailyKey {
  question: Question;
  market: Market;
  date: string;
}
