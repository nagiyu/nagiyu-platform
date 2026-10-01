/**
 * Stock Tracker Core - Daily Summary Repository Interface
 *
 * 日次サマリーデータの操作インターフェース
 */

import type {
  DailySummaryEntity,
  DailySummaryForecastFields,
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
   * 返却順序は Date 昇順・同日内は TickerID 昇順を契約とする（date省略時に最新日付へ
   * 絞り込んだ後も、この順序を維持したまま返す）。
   *
   * @param exchangeId - 取引所ID
   * @param date - 対象日 (YYYY-MM-DD)。省略時は取引所内でデータが存在する最も新しい日付の全サマリーを取得
   * @returns 指定日（または取引所内の最も新しい日付）のサマリー配列（Date昇順・同日内はTickerID昇順）
   */
  getByExchange(exchangeId: string, date?: string): Promise<DailySummaryEntity[]>;

  /**
   * 取引所IDと日付範囲でサマリーを取得
   *
   * `getByExchange` は単一日付 / 最新日に特化しているため、期間範囲の取得はこちらを使う。
   * 範囲は両端含む（inclusive）。
   *
   * 返却順序は Date 昇順・同日内は TickerID 昇順を契約とする（兄弟メソッドの
   * `getByExchange` と同じ順序）。
   *
   * @param exchangeId - 取引所ID
   * @param fromDate - 開始日 (YYYY-MM-DD、含む)
   * @param toDate - 終了日 (YYYY-MM-DD、含む)
   * @returns 期間内の全サマリー配列（Date昇順・同日内はTickerID昇順）
   */
  getByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryEntity[]>;

  /**
   * 取引所IDと日付範囲で、確度算出に使う属性だけを取得する。
   *
   * 確度算出に使わない属性を持たないため、`getByExchangeAndDateRange` より読み出し量が少ない。
   * 返却順序・範囲の両端の扱いは `getByExchangeAndDateRange` と同じ。
   *
   * @param exchangeId - 取引所ID
   * @param fromDate - 開始日 (YYYY-MM-DD、含む)
   * @param toDate - 終了日 (YYYY-MM-DD、含む)
   * @returns 期間内の全サマリーの射影配列（Date昇順・同日内はTickerID昇順）
   */
  getForecastFieldsByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryForecastFields[]>;

  /**
   * サマリーを保存（既存の場合は上書き）
   *
   * @param input - 日次サマリーデータ
   * @returns 保存されたサマリー
   */
  upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity>;
}
