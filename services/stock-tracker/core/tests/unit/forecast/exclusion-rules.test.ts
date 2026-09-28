/**
 * 除外ルールのテスト（design.md §1.1・§4、#3830 の過去データ除外）。
 */
import { buildPanel, excludeLegacyBackfillRows } from '../../../src/forecast/preprocessing.js';
import { computeOutcomes } from '../../../src/forecast/compute.js';
import { LEGACY_BACKFILL_HOLIDAY_COPY_DATES } from '../../../src/forecast/constants.js';
import { nominalExchangeTime } from '../../../src/forecast/time.js';
import type { DailyBarInput } from '../../../src/forecast/types.js';
import { REAL_EXCHANGES } from './support/exchanges.js';

function bar(
  overrides: Partial<DailyBarInput> & Pick<DailyBarInput, 'tickerId' | 'exchangeId' | 'date'>
): DailyBarInput {
  return {
    open: 100,
    high: 105,
    low: 95,
    close: 100,
    volume: 1000,
    createdAt: new Date(`${overrides.date}T00:00:00Z`).getTime(),
    ...overrides,
  };
}

describe('極端リターンの除外（FR-14）', () => {
  it('|翌営業日リターン| > 20% は Outcome から除外され、Hit が付かない', () => {
    const bars: DailyBarInput[] = [
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-05', close: 100 }),
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-06', close: 130 }), // +30%
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-07', close: 131 }),
    ];
    const { tickerOutcomes } = computeOutcomes(bars, 1, REAL_EXCHANGES);
    const outcome = tickerOutcomes.find((o) => o.date === '2026-01-05')!;
    expect(outcome.excludedReason).toBe('EXTREME_RETURN');
    expect(outcome.hit).toEqual({});
    expect(outcome.nextReturn).toBeCloseTo(0.3, 8);
    expect(outcome.excessReturn).toBeUndefined();
  });

  it('20%ちょうどは除外されない', () => {
    const bars: DailyBarInput[] = [
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-05', close: 100 }),
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-06', close: 120 }), // ちょうど+20%
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-07', close: 121 }),
    ];
    const { tickerOutcomes } = computeOutcomes(bars, 1, REAL_EXCHANGES);
    const outcome = tickerOutcomes.find((o) => o.date === '2026-01-05')!;
    expect(outcome.excludedReason).toBeUndefined();
  });
});

describe('観測カレンダーによる翌営業日の決定と、欠落日をまたぐ銘柄の実績', () => {
  it('銘柄に欠落日があると、その前日の実績は作られない（次の実際のレコードが観測カレンダーの翌営業日と一致しないため）', () => {
    const bars: DailyBarInput[] = [
      // ティッカー A: 01-07 が欠落
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-05' }),
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-06' }),
      // 2026-01-07 は無い
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-08' }),
      // ティッカー B: 欠落なし（観測カレンダーに 01-07 を存在させる）
      bar({ tickerId: 'B', exchangeId: 'TSE', date: '2026-01-05' }),
      bar({ tickerId: 'B', exchangeId: 'TSE', date: '2026-01-06' }),
      bar({ tickerId: 'B', exchangeId: 'TSE', date: '2026-01-07' }),
      bar({ tickerId: 'B', exchangeId: 'TSE', date: '2026-01-08' }),
    ];
    const panel = buildPanel(bars, REAL_EXCHANGES);
    // 観測カレンダーには 01-07 が含まれる（B のおかげで欠落日でも観測カレンダーからは消えない）
    expect(panel.calendar.JP).toContain('2026-01-07');

    const aOn0106 = panel.tickerSamples.find((s) => s.tickerId === 'A' && s.date === '2026-01-06')!;
    expect(aOn0106.nextOk).toBe(false); // 次の実レコード(01-08) が観測カレンダーの翌営業日(01-07)と不一致

    const { tickerOutcomes } = computeOutcomes(bars, 1, REAL_EXCHANGES);
    expect(
      tickerOutcomes.find((o) => o.tickerId === 'A' && o.date === '2026-01-06')
    ).toBeUndefined();
    // B は欠落が無いので実績が作られる
    expect(tickerOutcomes.find((o) => o.tickerId === 'B' && o.date === '2026-01-06')).toBeDefined();
  });
});

describe('#3830 過去データ除外（初期値算出のみで使う）', () => {
  it('休場日コピー足の日付は除外される', () => {
    const holiday = LEGACY_BACKFILL_HOLIDAY_COPY_DATES.JP[0];
    const bars: DailyBarInput[] = [
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-05', close: 100 }),
      bar({ tickerId: 'A', exchangeId: 'TSE', date: holiday, close: 999 }),
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-06', close: 101 }),
    ];
    const filtered = excludeLegacyBackfillRows(bars, REAL_EXCHANGES);
    expect(filtered.find((b) => b.date === holiday)).toBeUndefined();
    expect(filtered).toHaveLength(2);
  });

  it('前レコードと OHLC が完全一致する行は除外される', () => {
    const bars: DailyBarInput[] = [
      bar({
        tickerId: 'A',
        exchangeId: 'TSE',
        date: '2026-01-05',
        open: 100,
        high: 105,
        low: 95,
        close: 100,
      }),
      bar({
        tickerId: 'A',
        exchangeId: 'TSE',
        date: '2026-01-06',
        open: 100,
        high: 105,
        low: 95,
        close: 100,
      }), // 完全一致 -> 除外
      bar({
        tickerId: 'A',
        exchangeId: 'TSE',
        date: '2026-01-07',
        open: 100,
        high: 106,
        low: 95,
        close: 101,
      }),
    ];
    const filtered = excludeLegacyBackfillRows(bars, REAL_EXCHANGES);
    expect(filtered.map((b) => b.date)).toEqual(['2026-01-05', '2026-01-07']);
  });

  it('CreatedAt が翌営業日の取引開始以降の途中足は除外される', () => {
    const bars: DailyBarInput[] = [
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-05', close: 100 }),
      bar({
        tickerId: 'A',
        exchangeId: 'TSE',
        date: '2026-01-06',
        close: 101,
        createdAt: nominalExchangeTime('TSE', '2026-01-07', 'open', REAL_EXCHANGES), // 翌営業日の寄付き以降 = 途中足
      }),
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-07', close: 102 }),
    ];
    const filtered = excludeLegacyBackfillRows(bars, REAL_EXCHANGES);
    expect(filtered.map((b) => b.date)).toEqual(['2026-01-05', '2026-01-07']);
  });

  it('正常なデータは除外されない', () => {
    const bars: DailyBarInput[] = [
      bar({
        tickerId: 'A',
        exchangeId: 'TSE',
        date: '2026-01-05',
        open: 100,
        high: 105,
        low: 95,
        close: 100,
      }),
      bar({
        tickerId: 'A',
        exchangeId: 'TSE',
        date: '2026-01-06',
        open: 101,
        high: 106,
        low: 96,
        close: 102,
      }),
    ];
    const filtered = excludeLegacyBackfillRows(bars, REAL_EXCHANGES);
    expect(filtered).toHaveLength(2);
  });
});
