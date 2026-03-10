/**
 * UI表示用の型定義
 *
 * Note: コアのビジネスロジック型は @nagiyu/stock-tracker-core/types で定義されています。
 * このファイルはフロントエンドのUI表示に特化した型のみを定義します。
 */

/**
 * 時間枠の型定義
 * TradingView API で対応するタイムフレーム（timeframe）に準拠
 */
export type Timeframe = '1' | '5' | '60' | 'D';

/**
 * 時間枠の表示用ラベル
 */
export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1': '1分足',
  '5': '5分足',
  '60': '1時間足',
  D: '日足',
} as const;

/**
 * チャート表示本数の型定義
 */
export type ChartBarCount = 10 | 30 | 50 | 100;

/**
 * チャート表示本数のプリセット値
 */
export const CHART_BAR_COUNTS: ChartBarCount[] = [10, 30, 50, 100];

/**
 * チャート表示本数のデフォルト値
 */
export const DEFAULT_CHART_BAR_COUNT: ChartBarCount = 100;

/**
 * チャート表示本数の表示用ラベル
 */
export const CHART_BAR_COUNT_LABELS: Record<ChartBarCount, string> = {
  10: '10本',
  30: '30本',
  50: '50本',
  100: '100本',
} as const;

/**
 * パターン分析の詳細
 */
export interface PatternDetail {
  /** パターン識別子（例: morning-star） */
  patternId: string;
  /** パターン名（例: 三川明けの明星） */
  name: string;
  /** パターン説明（ツールチップ表示用） */
  description: string;
  /** シグナル種別（買い/売り） */
  signalType: 'BUY' | 'SELL';
  /** 判定結果（合致/非合致/判定不能） */
  status: 'MATCHED' | 'NOT_MATCHED' | 'INSUFFICIENT_DATA';
}

/**
 * サマリーAPIレスポンス型
 */
export interface TickerSummary {
  tickerId: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** ISO 8601 UTC形式の更新日時 */
  updatedAt: string;
  /** MATCHED かつ BUY の件数 */
  buyPatternCount: number;
  /** MATCHED かつ SELL の件数 */
  sellPatternCount: number;
  /** パターン詳細一覧（空配列はバッチ未実行） */
  patternDetails: PatternDetail[];
  /** AI 解析結果（生成成功時のみ） */
  aiAnalysisResult?: AiAnalysisResult;
  /** AI 解析生成失敗時のエラー情報 */
  aiAnalysisError?: string;
  /** 保有情報（未保有の場合は null） */
  holding: {
    quantity: number;
    averagePrice: number;
  } | null;
}

/**
 * 取引所ごとのサマリーグループ
 */
export interface ExchangeSummaryGroup {
  exchangeId: string;
  exchangeName: string;
  date: string | null;
  summaries: TickerSummary[];
}

/**
 * GET /api/summaries レスポンス型
 */
export interface SummariesResponse {
  exchanges: ExchangeSummaryGroup[];
}
import type { AiAnalysisResult } from '@nagiyu/stock-tracker-core';
