/**
 * Stock Tracker Core - Daily Summary Repository Interface
 *
 * 日次サマリーデータの操作インターフェース
 */

import type {
  DailySummaryEntity,
  CreateDailySummaryInput,
} from '../entities/daily-summary.entity.js';

/**
 * Daily Summary Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface DailySummaryRepository {
  /**
   * TickerID と Date でサマリーを取得
   *
   * @param tickerId - ティッカーID
   * @param date - 対象日 (YYYY-MM-DD)
   * @returns サマリー（存在しない場合はnull）
   */
  getByTickerAndDate(tickerId: string, date: string): Promise<DailySummaryEntity | null>;

  /**
   * 取引所IDでサマリーを取得
   *
   * @param exchangeId - 取引所ID
   * @param date - 対象日 (YYYY-MM-DD)。省略時は取引所内でデータが存在する最も新しい日付の全サマリーを取得
   * @returns 指定日（または取引所内の最も新しい日付）のサマリー配列
   */
  getByExchange(exchangeId: string, date?: string): Promise<DailySummaryEntity[]>;

  /**
   * サマリーを保存（既存の場合は上書き）
   *
   * @param input - 日次サマリーデータ
   * @returns 保存されたサマリー
   */
  upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity>;
}
