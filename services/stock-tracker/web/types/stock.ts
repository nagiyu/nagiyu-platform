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
