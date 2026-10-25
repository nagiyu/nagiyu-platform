/**
 * Stock Tracker Core - サポート対象の値
 *
 * 取引所のタイムゾーンと保有株式の通貨は、扱う市場 (日本・米国) に対応する値だけを許可する。
 * 他の値を許すと、存在しないタイムゾーンの取引所が登録され、取引時間の判定で例外になる。
 *
 * クライアントコンポーネントから値として import できるよう、この定数群は DynamoDB や
 * AWS SDK に依存させない。core のルートから import すると、それらがクライアントバンドルに
 * 引き込まれてビルドが失敗するため、クライアントからはサブパス
 * `@nagiyu/stock-tracker-core/supported-values` を使う。
 */

import type { ExchangeMarket } from './entities/exchange.entity.js';

/** サポートするタイムゾーン (IANA 形式) */
export const SUPPORTED_TIMEZONES = ['America/New_York', 'Asia/Tokyo'] as const;

export type SupportedTimezone = (typeof SUPPORTED_TIMEZONES)[number];

/** タイムゾーンの表示名 (取引所選択の選択肢に使う) */
export const TIMEZONE_LABELS: Record<SupportedTimezone, string> = {
  'America/New_York': 'America/New_York (NYSE, NASDAQ)',
  'Asia/Tokyo': 'Asia/Tokyo (TSE)',
};

/** サポートする通貨 (ISO 4217) */
export const SUPPORTED_CURRENCIES = ['USD', 'JPY'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** 市場ごとの通貨。取引所の市場から保有株式の通貨の初期値を決めるために使う */
export const MARKET_CURRENCIES: Record<ExchangeMarket, SupportedCurrency> = {
  JP: 'JPY',
  US: 'USD',
};

/**
 * 市場から通貨を引く
 *
 * 市場が未設定の取引所では通貨を決められないため、空文字を返して利用者に選ばせる。
 */
export function getCurrencyForMarket(market: ExchangeMarket | null | undefined): string {
  if (market === null || market === undefined) {
    return '';
  }
  return MARKET_CURRENCIES[market] ?? '';
}
