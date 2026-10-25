/**
 * Stock Tracker Core - サポート対象の値 Unit Tests
 */

import {
  MARKET_CURRENCIES,
  SUPPORTED_CURRENCIES,
  SUPPORTED_TIMEZONES,
  TIMEZONE_LABELS,
  getCurrencyForMarket,
} from '../../src/supported-values';
import { EXCHANGE_MARKETS } from '../../src/entities/exchange.entity';
import type { ExchangeMarket } from '../../src/entities/exchange.entity';

describe('サポート対象の値', () => {
  it('タイムゾーンは日本と米国のみである', () => {
    expect([...SUPPORTED_TIMEZONES]).toEqual(['America/New_York', 'Asia/Tokyo']);
  });

  it('通貨は円とドルのみである', () => {
    expect([...SUPPORTED_CURRENCIES]).toEqual(['USD', 'JPY']);
  });

  it('すべてのサポート対象タイムゾーンに表示名がある', () => {
    for (const timezone of SUPPORTED_TIMEZONES) {
      expect(TIMEZONE_LABELS[timezone]).toContain(timezone);
    }
  });

  it('すべての市場がサポート対象の通貨に対応している', () => {
    for (const market of EXCHANGE_MARKETS) {
      expect(SUPPORTED_CURRENCIES).toContain(MARKET_CURRENCIES[market]);
    }
  });
});

describe('getCurrencyForMarket', () => {
  it('JP は JPY を返す', () => {
    expect(getCurrencyForMarket('JP')).toBe('JPY');
  });

  it('US は USD を返す', () => {
    expect(getCurrencyForMarket('US')).toBe('USD');
  });

  it('市場が undefined の場合は空文字を返す', () => {
    expect(getCurrencyForMarket(undefined)).toBe('');
  });

  it('市場が null の場合は空文字を返す', () => {
    expect(getCurrencyForMarket(null)).toBe('');
  });

  it('未知の市場コードの場合は空文字を返す', () => {
    expect(getCurrencyForMarket('XX' as ExchangeMarket)).toBe('');
  });
});
