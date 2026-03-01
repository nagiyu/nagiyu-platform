/**
 * Stock Tracker Core - Daily Summary Entity
 *
 * 日次サマリーのビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

import type { PatternResult } from '../services/pattern-analyzer.js';

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
  /** パターン分析結果 */
  Patterns?: PatternResult[];
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
 * DailySummaryのビジネスキー
 */
export interface DailySummaryKey {
  tickerId: string;
  date: string;
}
