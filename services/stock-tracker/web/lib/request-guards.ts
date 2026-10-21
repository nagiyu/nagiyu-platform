/**
 * API ルートが unknown のリクエストボディを扱うための型ガード
 *
 * ボディの項目は利用者の入力で、型は保証されない。
 * 型違いの値を後段へ渡さないよう、使う前にここで絞り込む。
 */

import {
  EXCHANGE_MARKETS,
  PRICE_SOURCES,
  type ExchangeMarket,
  type PriceSource,
} from '@nagiyu/stock-tracker-core';

/**
 * 値が JSON オブジェクト (null と配列を除く) かを判定する
 *
 * @param value - 判定する値
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 値が未指定か文字列かを判定する
 *
 * 未指定の扱い (必須か任意か) は呼び出し側のバリデーションに委ねるため、ここでは許容する。
 *
 * @param value - 判定する値
 */
export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

/**
 * 値が価格データソースかを判定する
 *
 * @param value - 判定する値
 */
export function isPriceSource(value: unknown): value is PriceSource {
  return (PRICE_SOURCES as readonly unknown[]).includes(value);
}

/**
 * 値が取引所の市場区分かを判定する
 *
 * @param value - 判定する値
 */
export function isExchangeMarket(value: unknown): value is ExchangeMarket {
  return (EXCHANGE_MARKETS as readonly unknown[]).includes(value);
}
