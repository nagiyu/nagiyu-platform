/**
 * Stock Tracker Core - Daily Summary Repository Interface
 *
 * 日次サマリーデータの操作インターフェース
 */

import type {
  DailySummaryEntity,
  DailySummaryKey,
  CreateDailySummaryInput,
} from '../entities/daily-summary.entity.js';

/**
 * `markAsEvaluated` で 1 回の書き込みとして反映する採点結果フィールド集合
 */
export interface DailySummaryEvaluationFields {
  /** 採点に使った翌営業日 (YYYY-MM-DD) */
  EvaluationDate: string;
  /** 採点終値 */
  EvaluationClose: number;
  /** 実績リターン (%) */
  ActualReturn: number;
  /** Hit / Miss 判定 */
  Hit: boolean;
  /** 採点に使った閾値 (%) */
  EvaluationThresholdPercent: number;
  /** 採点実行時刻 (Unix timestamp ms) */
  EvaluatedAt: number;
}

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
   * 取引所IDと日付範囲でサマリーを取得（GSI4 Query）
   *
   * 採点バッチ / 集計 API 用。既存 `getByExchange` は単一日付 / 最新日に特化しているため
   * 期間範囲対応を新設する。範囲は両端含む（inclusive）。
   *
   * @param exchangeId - 取引所ID
   * @param fromDate - 開始日 (YYYY-MM-DD、含む)
   * @param toDate - 終了日 (YYYY-MM-DD、含む)
   * @returns 期間内の全サマリー配列
   */
  getByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryEntity[]>;

  /**
   * サマリーを保存（既存の場合は上書き）
   *
   * @param input - 日次サマリーデータ
   * @returns 保存されたサマリー
   */
  upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity>;

  /**
   * 採点結果を既存 DailySummary に書き込む
   *
   * 条件: `attribute_not_exists(EvaluatedAt)`（二重採点防止）。
   * 既に採点済みの場合は `EntityAlreadyExistsError` を投げ、呼び出し側で skip 判定できる。
   *
   * @param key - 対象 DailySummary のキー
   * @param fields - 採点結果フィールド一式
   * @throws {EntityAlreadyExistsError} 既に採点済みの場合
   * @throws {EntityNotFoundError} 対象の DailySummary が存在しない場合
   */
  markAsEvaluated(key: DailySummaryKey, fields: DailySummaryEvaluationFields): Promise<void>;
}
