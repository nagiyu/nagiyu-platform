/**
 * UI表示用の型定義
 *
 * Note: コアのビジネスロジック型は @nagiyu/stock-tracker-core/types で定義されています。
 * このファイルはフロントエンドのUI表示に特化した型のみを定義します。
 */

/**
 * 時間枠の型定義
 * TradingView API で対応するタイムフレームに準拠
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
 * 取引セッションの型定義
 */
export type TradingSession = 'regular' | 'extended';

/**
 * 取引セッションの表示用ラベル
 */
export const TRADING_SESSION_LABELS: Record<TradingSession, string> = {
  regular: '通常取引',
  extended: '時間外取引',
} as const;
