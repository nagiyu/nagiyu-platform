/**
 * QuoteProvider ルーター
 *
 * TickerID の取引所プレフィックスに基づいて適切な QuoteProvider を返す。
 * US 銘柄は Finnhub、それ以外（TSE・未知含む）は TradingView を使用する（安全側デフォルト）。
 */

import type { QuoteProvider } from './types.js';

/**
 * US 取引所のキーセット
 *
 * これらの取引所に属する銘柄は Finnhub provider を使用する
 */
export const US_EXCHANGE_KEYS = new Set(['NASDAQ', 'NYSE', 'AMEX']);

/**
 * QuoteProvider 選択用のプロバイダーマップ
 */
export type QuoteProviderMap = {
  tradingView: QuoteProvider;
  finnhub: QuoteProvider;
};

/**
 * TickerID に基づいて適切な QuoteProvider を解決する
 *
 * US 取引所（NASDAQ / NYSE / AMEX）の銘柄は Finnhub を返す。
 * TSE・未知プレフィックスはすべて TradingView を返す（安全側デフォルト）。
 *
 * @param tickerId - ティッカーID（例: "NASDAQ:AAPL", "TSE:6501"）
 * @param providers - 選択肢となる QuoteProvider のマップ
 * @returns 選択された QuoteProvider
 */
export function resolveQuoteProvider(tickerId: string, providers: QuoteProviderMap): QuoteProvider {
  const exchangeKey = tickerId.split(':')[0] ?? '';

  if (US_EXCHANGE_KEYS.has(exchangeKey)) {
    return providers.finnhub;
  }

  return providers.tradingView;
}
