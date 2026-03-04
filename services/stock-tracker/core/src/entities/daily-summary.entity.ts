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
  /** パターン判定結果マップ */
  PatternResults?: PatternResults;
  /** 買いシグナル合致数 */
  BuyPatternCount?: number;
  /** 売りシグナル合致数 */
  SellPatternCount?: number;
  /** AI 解析テキスト（日本語） */
  AiAnalysis?: string;
  /** AI 解析生成失敗時のエラー情報 */
  AiAnalysisError?: string;
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
