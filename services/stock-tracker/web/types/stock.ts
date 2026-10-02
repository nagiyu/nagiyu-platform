import type { MarketForecastResponse, TickerForecastSummary } from './forecast';

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
 * サマリーAPIレスポンス型
 */
export interface TickerSummary {
  tickerId: string;
  /** 確度の基準日（YYYY-MM-DD） */
  date: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  /** ISO 8601 UTC形式の更新日時 */
  updatedAt: string;
  /** MATCHED かつ BUY の件数 */
  buyPatternCount: number;
  /** MATCHED かつ SELL の件数 */
  sellPatternCount: number;
  /** 買いアラート件数（enabled: 有効, disabled: 無効） */
  buyAlertCount: AlertCount;
  /** 売りアラート件数（enabled: 有効, disabled: 無効） */
  sellAlertCount: AlertCount;
  /** 保有情報（未保有の場合は null） */
  holding: {
    quantity: number;
    averagePrice: number;
  } | null;
  /** 確度の要約（Forecast アイテムが無ければ null） */
  forecast: TickerForecastSummary | null;
}

export interface AlertCount {
  enabled: number;
  disabled: number;
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
  /** 市場の荒れ予報（JP・US の 2 件） */
  marketForecasts: MarketForecastResponse[];
}
