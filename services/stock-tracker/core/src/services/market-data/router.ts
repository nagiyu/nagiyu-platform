/**
 * QuoteProvider ルーター
 *
 * Exchange.PriceSource に基づいて適切な QuoteProvider を返す。
 * 'finnhub' は Finnhub、それ以外（'tradingview' および未指定）は TradingView を使用する。
 */

import type { PriceSource } from '../../entities/exchange.entity.js';
import type { QuoteProvider } from './types.js';

/**
 * QuoteProvider 選択用のプロバイダーマップ
 */
export type QuoteProviderMap = {
  tradingView: QuoteProvider;
  finnhub: QuoteProvider;
};

/**
 * PriceSource に基づいて適切な QuoteProvider を解決する
 *
 * 'finnhub' の場合は Finnhub provider を返す。
 * それ以外（'tradingview' および安全側デフォルト）は TradingView provider を返す。
 *
 * @param priceSource - 取引所の価格取得元（Exchange.PriceSource）
 * @param providers - 選択肢となる QuoteProvider のマップ
 * @returns 選択された QuoteProvider
 */
export function resolveQuoteProvider(
  priceSource: PriceSource,
  providers: QuoteProviderMap
): QuoteProvider {
  if (priceSource === 'finnhub') {
    return providers.finnhub;
  }

  return providers.tradingView;
}
