/**
 * Stock Tracker Core - Daily Summary Entity
 *
 * 日次サマリーのビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */
import type { PatternResults } from '../types.js';

/**
 * 日次サマリーエンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 */
export interface DailySummaryEntity {
  /** ティッカーID */
  TickerID: string;
  /** 取引所ID */
  ExchangeID: string;
  /** 取引日 (YYYY-MM-DD 形式) */
  Date: string;
  /** 始値 */
  Open: number;
  /** 高値 */
  High: number;
  /** 安値 */
  Low: number;
  /** 終値 */
  Close: number;
  /** 出来高 */
  Volume?: number;
  /** パターン判定結果マップ */
  PatternResults?: PatternResults;
  /** 買いシグナル合致数 */
  BuyPatternCount?: number;
  /** 売りシグナル合致数 */
  SellPatternCount?: number;
  /** 作成日時 (Unix timestamp ms) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp ms) */
  UpdatedAt: number;
}

/**
 * DailySummary作成時の入力データ（CreatedAt/UpdatedAtを含まない）
 */
export type CreateDailySummaryInput = Omit<DailySummaryEntity, 'CreatedAt' | 'UpdatedAt'>;

/**
 * 確度算出バッチが読む属性だけに絞った DailySummary の射影。
 *
 * 大量の日付・銘柄を読む確度算出バッチの読み出し量を抑えるため、確度算出に使わない
 * 属性（UpdatedAt 等）は持たせない。
 */
export type DailySummaryForecastFields = Pick<
  DailySummaryEntity,
  | 'TickerID'
  | 'ExchangeID'
  | 'Date'
  | 'Open'
  | 'High'
  | 'Low'
  | 'Close'
  | 'Volume'
  | 'PatternResults'
  | 'BuyPatternCount'
  | 'SellPatternCount'
  | 'CreatedAt'
>;

/**
 * DailySummaryのビジネスキー
 */
export interface DailySummaryKey {
  tickerId: string;
  date: string;
}
