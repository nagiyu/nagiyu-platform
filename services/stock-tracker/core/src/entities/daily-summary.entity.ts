/**
 * Stock Tracker Core - Daily Summary Entity
 *
 * 日次サマリーのビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */
import type { PatternResults } from '../types.js';
import type { AiAnalysisResult } from '../ai-analysis-result.js';

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
  /** AI 解析結果（構造化） */
  AiAnalysisResult?: AiAnalysisResult;
  /** AI 解析生成失敗時のエラー情報 */
  AiAnalysisError?: string;
  /** 採点に使った翌営業日 (YYYY-MM-DD)。採点バッチが書き込む */
  EvaluationDate?: string;
  /** 採点終値 (EvaluationDate の終値) */
  EvaluationClose?: number;
  /** 実績リターン (%)。(EvaluationClose - Close) / Close * 100 */
  ActualReturn?: number;
  /** 採点結果（予測シグナルと閾値に基づく Hit/Miss） */
  Hit?: boolean;
  /** 採点に使った閾値 (%)。Phase 1 では 0.5 固定 */
  EvaluationThresholdPercent?: number;
  /** 採点実行時刻 (Unix timestamp ms)。存在で採点済みと判定する */
  EvaluatedAt?: number;
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
