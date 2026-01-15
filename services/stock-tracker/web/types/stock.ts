/**
 * 取引所の型定義
 */
export type Exchange = {
  id: string;
  name: string;
  key: string;
};

/**
 * ティッカーの型定義
 */
export type Ticker = {
  id: string;
  symbol: string;
  name: string;
  exchangeId: string;
};

/**
 * 時間枠の型定義
 */
export type Timeframe = '1m' | '5m' | '1h' | '1d';

/**
 * 時間枠の表示用ラベル
 */
export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1m': '1分足',
  '5m': '5分足',
  '1h': '1時間足',
  '1d': '日足',
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
