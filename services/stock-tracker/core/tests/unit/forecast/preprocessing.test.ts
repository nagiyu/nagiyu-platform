/**
 * 前処理（design.md §1.1・§1.2）の単体テスト。小さな手作りデータで境界条件を確認する。
 */
import { buildObservationCalendar, buildPanel } from '../../../src/forecast/preprocessing.js';
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

describe('buildObservationCalendar', () => {
  it('いずれかの銘柄にサマリーがある日付の集合をソートして返す', () => {
    const bars: DailyBarInput[] = [
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-06' }),
      bar({ tickerId: 'B', exchangeId: 'TSE', date: '2026-01-05' }),
      bar({ tickerId: 'A', exchangeId: 'NASDAQ', date: '2026-01-05' }), // ticker id が同じでも exchangeId で市場が決まる
    ];
    const calendar = buildObservationCalendar(bars, REAL_EXCHANGES);
    expect(calendar.JP).toEqual(['2026-01-05', '2026-01-06']);
    expect(calendar.US).toEqual(['2026-01-05']);
  });
});

describe('値幅・出来高の異常値（design.md §1.2）', () => {
  it('値幅が0以下は欠損扱いになる（当日高値=安値）', () => {
    const bars: DailyBarInput[] = [
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-05', close: 100 }),
      bar({
        tickerId: 'A',
        exchangeId: 'TSE',
        date: '2026-01-06',
        high: 100,
        low: 100,
        close: 100,
      }),
    ];
    const panel = buildPanel(bars, REAL_EXCHANGES);
    const row = panel.tickerSamples.find((s) => s.date === '2026-01-06')!;
    expect(row.rawRangeToday).toBeUndefined();
  });

  it('出来高が0以下は欠損扱いになる', () => {
    const bars: DailyBarInput[] = [
      bar({ tickerId: 'A', exchangeId: 'TSE', date: '2026-01-05', volume: 0 }),
    ];
    const panel = buildPanel(bars, REAL_EXCHANGES);
    const row = panel.tickerSamples[0];
    expect(row.normalVolume).toBeUndefined();
  });
});

describe('平常（直近20レコード平均。design.md §1.1）', () => {
  it('20レコードすべて有効な場合のみ算出される', () => {
    const bars: DailyBarInput[] = [];
    for (let i = 0; i < 25; i++) {
      const date = `2026-01-${String(i + 1).padStart(2, '0')}`;
      bars.push(
        bar({ tickerId: 'A', exchangeId: 'TSE', date, high: 110, low: 90, close: 100 + i })
      );
    }
    const panel = buildPanel(bars, REAL_EXCHANGES);
    const rows = panel.tickerSamples;
    // 値幅は前日終値が要るため index0 は値幅自体が無く、直近20件の値幅がすべて揃うのは index20 から
    expect(rows[19].normalRange).toBeUndefined();
    expect(rows[20].normalRange).toBeDefined();
  });

  it('途中で値幅が欠損すると、その後20レコード分は平常が算出されない', () => {
    const bars: DailyBarInput[] = [];
    for (let i = 0; i < 30; i++) {
      const date = `2026-${i < 26 ? '01' : '02'}-${String((i % 26) + 1).padStart(2, '0')}`;
      const isGap = i === 10;
      bars.push(
        bar({
          tickerId: 'A',
          exchangeId: 'TSE',
          date,
          high: isGap ? 100 : 110,
          low: isGap ? 100 : 90, // 欠損日は高値=安値で値幅0
          close: 100 + i,
        })
      );
    }
    const panel = buildPanel(bars, REAL_EXCHANGES);
    const rows = panel.tickerSamples;
    // index10 の欠損のせいで、index10..29 の20件窓には常に欠損が含まれるため normalRange は無い
    // (index29 の窓は index10..29 のちょうど20件で、欠損を含む)
    expect(rows[29].normalRange).toBeUndefined();
  });
});

describe('市場レベル軸（design.md §1.2 後段）', () => {
  it('同日・同市場の銘柄のうち、値がある銘柄だけで平均する', () => {
    const bars: DailyBarInput[] = [];
    for (let i = 0; i < 25; i++) {
      const date = `2026-01-${String(i + 1).padStart(2, '0')}`;
      bars.push(bar({ tickerId: 'A', exchangeId: 'TSE', date, high: 110, low: 90, close: 100 }));
      bars.push(bar({ tickerId: 'B', exchangeId: 'TSE', date, high: 108, low: 92, close: 100 }));
    }
    const panel = buildPanel(bars, REAL_EXCHANGES);
    const lastDate = '2026-01-25';
    const a = panel.tickerSamples.find((s) => s.tickerId === 'A' && s.date === lastDate)!;
    const b = panel.tickerSamples.find((s) => s.tickerId === 'B' && s.date === lastDate)!;
    expect(a.marketRangeToday).toBeDefined();
    expect(a.marketRangeToday).toBe(b.marketRangeToday);
    expect(a.marketRangeToday).toBeCloseTo((a.rangeToday! + b.rangeToday!) / 2, 10);
  });
});

describe('市場×日パネル（Q-MKT。design.md §1.2）', () => {
  it('市場平均値幅の平常比(market-range-avg)が算出される', () => {
    const bars: DailyBarInput[] = [];
    for (let i = 0; i < 25; i++) {
      const date = `2026-01-${String(i + 1).padStart(2, '0')}`;
      bars.push(
        bar({ tickerId: 'A', exchangeId: 'TSE', date, high: 110, low: 90, close: 100 + i })
      );
    }
    const panel = buildPanel(bars, REAL_EXCHANGES);
    const marketRows = panel.marketSamples.filter((s) => s.market === 'JP');
    expect(marketRows[marketRows.length - 1].marketRangeAvg).toBeDefined();
  });
});
