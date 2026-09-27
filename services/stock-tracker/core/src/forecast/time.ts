/**
 * Stock Tracker Core - Forecast 市場・セッション時刻
 *
 * 将来データ混入を防ぐための時刻の規則（design.md §1.4・§4）の基礎になる純粋関数群。
 */
import { fromZonedTime } from 'date-fns-tz';
import {
  FORECAST_ERROR_MESSAGES,
  JP_EXCHANGE_IDS,
  SESSION_CLOSE_TIME,
  SESSION_OPEN_TIME,
  SESSION_TIMEZONE,
  US_EXCHANGE_IDS,
  type Market,
} from './constants.js';

/**
 * ExchangeID から市場を判定する（design.md ADR-V4-01）。
 * JP = TSE、US = NASDAQ・NYSE・AMEX。
 */
export function getMarketForExchange(exchangeId: string): Market {
  if (JP_EXCHANGE_IDS.includes(exchangeId)) {
    return 'JP';
  }
  if (US_EXCHANGE_IDS.includes(exchangeId)) {
    return 'US';
  }
  throw new Error(FORECAST_ERROR_MESSAGES.UNKNOWN_EXCHANGE);
}

/**
 * 名目の取引開始・引け時刻（UTC の Unix timestamp ms）を返す。
 *
 * 取引所マスタの Start/End は時間外取引込みのため使わない。JP: Asia/Tokyo 09:00/15:30、
 * US: America/New_York 09:30/16:00 の固定値を使う（design.md 必読メモ）。
 */
export function nominalSessionTime(date: string, market: Market, which: 'open' | 'close'): number {
  const time = which === 'open' ? SESSION_OPEN_TIME[market] : SESSION_CLOSE_TIME[market];
  return fromZonedTime(`${date}T${time}:00`, SESSION_TIMEZONE[market]).getTime();
}

/** 名目引け時刻（UTC ms）。サンプル選別・基準値・中立帯・確率帯すべてで使う共通の時刻。 */
export function nominalCloseTime(date: string, market: Market): number {
  return nominalSessionTime(date, market, 'close');
}

/** 名目取引開始時刻（UTC ms）。#3830 の除外2（途中足）判定でのみ使う。 */
export function nominalOpenTime(date: string, market: Market): number {
  return nominalSessionTime(date, market, 'open');
}

/**
 * 市場 M の D の予測に、市場 sampleMarket・サンプルの翌営業日 sampleNextDate のサンプルを
 * 使ってよいかどうか（design.md §1.4 の時刻の規則）。
 *
 * 名目引け時刻(サンプルの翌営業日, サンプルの市場) ≤ 名目引け時刻(D, M)
 */
export function isSampleUsable(
  sampleNextDate: string,
  sampleMarket: Market,
  predictionDate: string,
  predictionMarket: Market
): boolean {
  return (
    nominalCloseTime(sampleNextDate, sampleMarket) <=
    nominalCloseTime(predictionDate, predictionMarket)
  );
}

/**
 * 市場の観測カレンダー（ソート済み日付配列）から、date の翌営業日を返す。
 * date がカレンダーに無い、または最終日の場合は undefined。
 */
export function getNextCalendarDate(calendar: readonly string[], date: string): string | undefined {
  const index = calendar.indexOf(date);
  if (index === -1 || index + 1 >= calendar.length) {
    return undefined;
  }
  return calendar[index + 1];
}

/**
 * 市場の観測カレンダーにおける date のインデックス（見つからなければ -1）。
 */
export function getCalendarIndex(calendar: readonly string[], date: string): number {
  return calendar.indexOf(date);
}
