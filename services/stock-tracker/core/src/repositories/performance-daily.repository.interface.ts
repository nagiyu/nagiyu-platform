/**
 * Stock Tracker Core - PerformanceDaily Repository Interface
 *
 * 予測日ごとの採点済み件数の集計データの操作インターフェース
 */
import type { Market, PerformanceDailyItem, Question } from '../forecast/index.js';

/**
 * PerformanceDaily Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース。
 * PerformanceDaily は予測日ごとの集計であり、採点が進むたびに再計算して置き換えてよい
 * （design.md §2.1「冪等」）ため、条件無しの upsert のみを持つ。
 */
export interface PerformanceDailyRepository {
  /**
   * PerformanceDaily を保存する（既存の場合は無条件で置き換える）。
   */
  save(item: PerformanceDailyItem): Promise<PerformanceDailyItem>;

  /**
   * 問い・市場・日付で単一の PerformanceDaily を取得
   *
   * @returns PerformanceDaily（存在しない場合は null）
   */
  getByDate(question: Question, market: Market, date: string): Promise<PerformanceDailyItem | null>;

  /**
   * 問い・市場の PerformanceDaily を、期間（fromDate 以上・toDate 以下）で取得する
   * （`/api/axis-performance` が期間分を合計するための入力。design.md §6.4）。
   *
   * @param fromDate - 開始日 (YYYY-MM-DD、含む)
   * @param toDate - 終了日 (YYYY-MM-DD、含む)。省略時は fromDate 以降の全期間
   * @returns Date 昇順の配列
   */
  getByPeriod(
    question: Question,
    market: Market,
    fromDate: string,
    toDate?: string
  ): Promise<PerformanceDailyItem[]>;
}
