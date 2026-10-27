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
  tickerId: string;
  /** 取引所ID */
  exchangeId: string;
  /** 取引日 (YYYY-MM-DD 形式) */
  date: string;
  /** 始値 */
  open: number;
  /** 高値 */
  high: number;
  /** 安値 */
  low: number;
  /** 終値 */
  close: number;
  /** 出来高 */
  volume?: number;
  /** パターン判定結果マップ */
  patternResults?: PatternResults;
  /** 買いシグナル合致数 */
  buyPatternCount?: number;
  /** 売りシグナル合致数 */
  sellPatternCount?: number;
  /** 作成日時 (Unix timestamp ms) */
  createdAt: number;
  /** 更新日時 (Unix timestamp ms) */
  updatedAt: number;
}

/**
 * DailySummary作成時の入力データ (createdAt/updatedAtを含まない)
 */
export type CreateDailySummaryInput = Omit<DailySummaryEntity, 'createdAt' | 'updatedAt'>;

/**
 * 確度算出バッチが読む属性だけに絞った DailySummary の射影。
 *
 * 大量の日付・銘柄を読む確度算出バッチの読み出し量を抑えるため、確度算出に使わない
 * 属性 (updatedAt 等) は持たせない。
 */
export type DailySummaryForecastFields = Pick<
  DailySummaryEntity,
  | 'tickerId'
  | 'exchangeId'
  | 'date'
  | 'open'
  | 'high'
  | 'low'
  | 'close'
  | 'volume'
  | 'patternResults'
  | 'buyPatternCount'
  | 'sellPatternCount'
  | 'createdAt'
>;

/**
 * DailySummaryのビジネスキー
 */
export interface DailySummaryKey {
  tickerId: string;
  date: string;
}
