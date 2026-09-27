import {
  getCalendarIndex,
  getMarketForExchange,
  getNextCalendarDate,
  isSampleUsable,
  nominalCloseTime,
  nominalOpenTime,
} from '../../../src/forecast/time.js';
import { FORECAST_ERROR_MESSAGES } from '../../../src/forecast/constants.js';

describe('getMarketForExchange', () => {
  it('TSE は JP', () => {
    expect(getMarketForExchange('TSE')).toBe('JP');
  });
  it('NASDAQ・NYSE・AMEX は US', () => {
    expect(getMarketForExchange('NASDAQ')).toBe('US');
    expect(getMarketForExchange('NYSE')).toBe('US');
    expect(getMarketForExchange('AMEX')).toBe('US');
  });
  it('未対応の取引所は例外', () => {
    expect(() => getMarketForExchange('LSE')).toThrow(FORECAST_ERROR_MESSAGES.UNKNOWN_EXCHANGE);
  });
});

describe('nominalCloseTime / nominalOpenTime', () => {
  it('JP の引けは Asia/Tokyo 15:30 = UTC 06:30', () => {
    const t = nominalCloseTime('2026-06-01', 'JP');
    expect(new Date(t).toISOString()).toBe('2026-06-01T06:30:00.000Z');
  });
  it('US の引けは America/New_York 16:00（夏時間 EDT=UTC-4）= UTC 20:00', () => {
    const t = nominalCloseTime('2026-06-01', 'US');
    expect(new Date(t).toISOString()).toBe('2026-06-01T20:00:00.000Z');
  });
  it('JP の始値は 09:00 = UTC 00:00', () => {
    const t = nominalOpenTime('2026-06-01', 'JP');
    expect(new Date(t).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('isSampleUsable', () => {
  it('JP が D に予測するとき、US の D−1 のサンプル（翌営業日=D）は US の D の引けで確定するため使えない', () => {
    // US の D-1 (2026-06-01) の翌営業日は D (2026-06-02)。US の 2026-06-02 の引け(20:00 UTC) は
    // JP の 2026-06-02 の引け(06:30 UTC) より後なので使えない。
    expect(isSampleUsable('2026-06-02', 'US', '2026-06-02', 'JP')).toBe(false);
  });

  it('US が D に予測するとき、JP の D のサンプル（翌営業日=D+1）は JP の引けが US より先に来るため使える', () => {
    // JP の D(2026-06-02) の翌営業日 D+1(2026-06-03) の JP 引け(06:30 UTC 06-03) は
    // US の D(2026-06-02) の引け(20:00 UTC 06-02) より後 -> 使えない
    expect(isSampleUsable('2026-06-03', 'JP', '2026-06-02', 'US')).toBe(false);
  });

  it('同市場・翌日確定は使える', () => {
    expect(isSampleUsable('2026-06-02', 'JP', '2026-06-02', 'JP')).toBe(true);
  });
});

describe('getNextCalendarDate / getCalendarIndex', () => {
  const calendar = ['2026-06-01', '2026-06-02', '2026-06-03'];
  it('翌営業日を返す', () => {
    expect(getNextCalendarDate(calendar, '2026-06-01')).toBe('2026-06-02');
  });
  it('最終日は undefined', () => {
    expect(getNextCalendarDate(calendar, '2026-06-03')).toBeUndefined();
  });
  it('カレンダーに無い日付は undefined', () => {
    expect(getNextCalendarDate(calendar, '2026-06-09')).toBeUndefined();
  });
  it('インデックスを返す', () => {
    expect(getCalendarIndex(calendar, '2026-06-02')).toBe(1);
    expect(getCalendarIndex(calendar, '2026-06-09')).toBe(-1);
  });
});
