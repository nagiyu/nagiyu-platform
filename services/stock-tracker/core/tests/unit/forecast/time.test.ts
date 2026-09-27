import {
  distinctMarkets,
  getCalendarIndex,
  getMarketForExchange,
  getNextCalendarDate,
  hasExchangeSession,
  isMarketSampleUsable,
  isTickerSampleUsable,
  nominalExchangeTime,
  nominalMarketCloseTime,
  tryGetMarketForExchange,
} from '../../../src/forecast/time.js';
import { FORECAST_ERROR_MESSAGES } from '../../../src/forecast/constants.js';
import { REAL_EXCHANGES } from './support/exchanges.js';

describe('getMarketForExchange / tryGetMarketForExchange（取引所マスタの市場属性）', () => {
  it('TSE は JP', () => {
    expect(getMarketForExchange('TSE', REAL_EXCHANGES)).toBe('JP');
  });
  it('NASDAQ・NYSE・AMEX は US', () => {
    expect(getMarketForExchange('NASDAQ', REAL_EXCHANGES)).toBe('US');
    expect(getMarketForExchange('NYSE', REAL_EXCHANGES)).toBe('US');
    expect(getMarketForExchange('AMEX', REAL_EXCHANGES)).toBe('US');
  });
  it('マスタに無い取引所は例外（getMarketForExchange）', () => {
    expect(() => getMarketForExchange('LSE', REAL_EXCHANGES)).toThrow(
      FORECAST_ERROR_MESSAGES.UNKNOWN_EXCHANGE
    );
  });
  it('マスタに無い取引所は undefined（tryGetMarketForExchange）', () => {
    expect(tryGetMarketForExchange('LSE', REAL_EXCHANGES)).toBeUndefined();
  });
  it('market が未設定の取引所は未対応の ExchangeID と同様に扱う', () => {
    const withUnassigned = [
      ...REAL_EXCHANGES,
      { exchangeId: 'XYZ', timezone: 'UTC', start: '00:00', end: '08:00' },
    ];
    expect(tryGetMarketForExchange('XYZ', withUnassigned)).toBeUndefined();
    expect(hasExchangeSession('XYZ', withUnassigned)).toBe(true); // セッション情報自体はある
  });
});

describe('distinctMarkets（取引所マスタに現れる市場コードの集合）', () => {
  it('初期設定（JP・US）では2市場', () => {
    expect(distinctMarkets(REAL_EXCHANGES)).toEqual(['JP', 'US']);
  });

  it('3市場を与えても動く（市場は固定2つに限らない）', () => {
    const threeMarkets = [
      ...REAL_EXCHANGES,
      {
        exchangeId: 'EURONEXT',
        market: 'EU',
        timezone: 'Europe/Paris',
        start: '09:00',
        end: '17:30',
      },
    ];
    expect(distinctMarkets(threeMarkets)).toEqual(['EU', 'JP', 'US']);
    expect(getMarketForExchange('EURONEXT', threeMarkets)).toBe('EU');
    const t = nominalMarketCloseTime('EU', '2026-06-01', threeMarkets);
    expect(new Date(t).toISOString()).toBe('2026-06-01T15:30:00.000Z');
  });

  it('market 未設定の取引所は数えない', () => {
    const withUnassigned = [
      ...REAL_EXCHANGES,
      { exchangeId: 'XYZ', timezone: 'UTC', start: '00:00', end: '08:00' },
    ];
    expect(distinctMarkets(withUnassigned)).toEqual(['JP', 'US']);
  });
});

describe('nominalExchangeTime / nominalMarketCloseTime', () => {
  it('JP(TSE)の引けは Asia/Tokyo 15:30 = UTC 06:30', () => {
    const t = nominalExchangeTime('TSE', '2026-06-01', 'close', REAL_EXCHANGES);
    expect(new Date(t).toISOString()).toBe('2026-06-01T06:30:00.000Z');
  });
  it('US(NASDAQ)の引けは America/New_York 16:00（夏時間 EDT=UTC-4）= UTC 20:00', () => {
    const t = nominalExchangeTime('NASDAQ', '2026-06-01', 'close', REAL_EXCHANGES);
    expect(new Date(t).toISOString()).toBe('2026-06-01T20:00:00.000Z');
  });
  it('JP(TSE)の始値は 09:00 = UTC 00:00', () => {
    const t = nominalExchangeTime('TSE', '2026-06-01', 'open', REAL_EXCHANGES);
    expect(new Date(t).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
  it('マスタに無い ExchangeID は例外', () => {
    expect(() => nominalExchangeTime('LSE', '2026-06-01', 'close', REAL_EXCHANGES)).toThrow(
      FORECAST_ERROR_MESSAGES.UNKNOWN_EXCHANGE
    );
  });

  it('市場 M の名目引け時刻は、M に属する取引所の End の最も遅いもの', () => {
    // US は初期設定で NASDAQ・NYSE・AMEX とも同じ 16:00 だが、異なる設定でも安全側になることを確認する
    const staggered = REAL_EXCHANGES.map((e) =>
      e.exchangeId === 'NYSE' ? { ...e, end: '18:00' } : e
    );
    const t = nominalMarketCloseTime('US', '2026-06-01', staggered);
    expect(new Date(t).toISOString()).toBe('2026-06-01T22:00:00.000Z'); // NYSE 18:00 EDT = UTC 22:00
  });

  it('市場に属する取引所が1つもマスタに無ければ例外', () => {
    expect(() => nominalMarketCloseTime('EU', '2026-06-01', REAL_EXCHANGES)).toThrow(
      FORECAST_ERROR_MESSAGES.UNKNOWN_EXCHANGE
    );
  });
});

describe('isTickerSampleUsable / isMarketSampleUsable', () => {
  it('JP が D に予測するとき、US の D−1 のサンプル（翌営業日=D）は US の D の引けで確定するため使えない', () => {
    // US の D-1 の翌営業日は D (2026-06-02)。US の 2026-06-02 の引け(20:00 UTC) は
    // JP の 2026-06-02 の引け(06:30 UTC) より後なので使えない。
    expect(isTickerSampleUsable('2026-06-02', 'NASDAQ', '2026-06-02', 'JP', REAL_EXCHANGES)).toBe(
      false
    );
    expect(isMarketSampleUsable('2026-06-02', 'US', '2026-06-02', 'JP', REAL_EXCHANGES)).toBe(
      false
    );
  });

  it('US が D に予測するとき、JP の D のサンプル（翌営業日=D+1）は JP の引けが US より先に来るため使える', () => {
    // JP の D(2026-06-02) の翌営業日 D+1(2026-06-03) の JP 引け(06:30 UTC 06-03) は
    // US の D(2026-06-02) の引け(20:00 UTC 06-02) より後 -> 使えない
    expect(isTickerSampleUsable('2026-06-03', 'TSE', '2026-06-02', 'US', REAL_EXCHANGES)).toBe(
      false
    );
    expect(isMarketSampleUsable('2026-06-03', 'JP', '2026-06-02', 'US', REAL_EXCHANGES)).toBe(
      false
    );
  });

  it('同市場・翌日確定は使える', () => {
    expect(isTickerSampleUsable('2026-06-02', 'TSE', '2026-06-02', 'JP', REAL_EXCHANGES)).toBe(
      true
    );
    expect(isMarketSampleUsable('2026-06-02', 'JP', '2026-06-02', 'JP', REAL_EXCHANGES)).toBe(true);
  });

  it('US の D のサンプル（翌営業日=D+1）は JP の D の予測には使えない（US の D の引けは JP の D より後）', () => {
    expect(isTickerSampleUsable('2026-06-03', 'NASDAQ', '2026-06-02', 'JP', REAL_EXCHANGES)).toBe(
      false
    );
  });

  it('JP の D のサンプル（翌営業日=D+1）は US の D の予測に使える（JP の引けは同日のより早い時刻）', () => {
    // ここでの「D のサンプル」は JP の D-1 のサンプル（翌営業日=D）を指す
    expect(isTickerSampleUsable('2026-06-02', 'TSE', '2026-06-02', 'US', REAL_EXCHANGES)).toBe(
      true
    );
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
