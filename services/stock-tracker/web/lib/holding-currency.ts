/**
 * 保有株式の通貨の初期値を、取引所の市場から決める。
 *
 * 通貨を固定の既定値にすると、東証の銘柄でも変更しないと USD で登録されてしまう。
 * 市場が決められないときは空文字を返し、利用者に選ばせる (フォームの必須チェックが働く)。
 */

import type { ExchangeMarket } from '@nagiyu/stock-tracker-core';

/** 通貨の初期値を決めるのに必要な、取引所の項目 */
export interface ExchangeWithMarket {
  exchangeId: string;
  market?: ExchangeMarket | null;
}

/** 市場ごとの通貨 */
const MARKET_CURRENCIES: Record<ExchangeMarket, string> = {
  JP: 'JPY',
  US: 'USD',
};

/**
 * 取引所 ID から通貨の初期値を返す
 *
 * 取引所が未選択、一覧に無い、または市場が未設定の場合は空文字を返す。
 */
export function resolveInitialCurrency(
  exchanges: ReadonlyArray<ExchangeWithMarket>,
  exchangeId: string
): string {
  const market = exchanges.find((ex) => ex.exchangeId === exchangeId)?.market;
  if (market === null || market === undefined) {
    return '';
  }
  return MARKET_CURRENCIES[market] ?? '';
}
