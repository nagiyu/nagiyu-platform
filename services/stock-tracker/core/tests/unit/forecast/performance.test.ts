/**
 * Stock Tracker Core - PerformanceDaily 集計（computePerformanceDaily）のユニットテスト
 *
 * design.md §2.2 PerformanceDaily・§6.4 の集計仕様（軸ごとの件数・的中数・超過リターン合計、
 * 確率帯ごとの件数・的中数・確率の合計、除外分は数えない）を検証する。
 */
import {
  AXIS_ID_BUY_COUNT_GE2,
  AXIS_ID_MARKET_RANGE_AVG,
  AXIS_ID_RANGE_TODAY,
} from '../../../src/forecast/axes.js';
import { computePerformanceDaily } from '../../../src/forecast/performance.js';
import type { MarketSample, TickerSample } from '../../../src/forecast/types.js';

function tickerSample(overrides: Partial<TickerSample> = {}): TickerSample {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    market: 'US',
    date: '2026-02-27',
    axisValues: {},
    ...overrides,
  };
}

describe('computePerformanceDaily', () => {
  it('採点済みの件数・的中数を集計し、未採点・除外分は数えない', () => {
    const samples: TickerSample[] = [
      tickerSample({
        tickerId: 'T1',
        axisValues: { [AXIS_ID_BUY_COUNT_GE2]: true },
        outcome: { nextDate: '2026-02-28', hit: { DIR: true } },
      }),
      tickerSample({
        tickerId: 'T2',
        axisValues: { [AXIS_ID_BUY_COUNT_GE2]: false },
        outcome: { nextDate: '2026-02-28', hit: { DIR: false } },
      }),
      // 未採点（outcome なし）
      tickerSample({ tickerId: 'T3', axisValues: { [AXIS_ID_BUY_COUNT_GE2]: true } }),
      // 除外（極端リターン）: hit が無いため自然に除外される
      tickerSample({
        tickerId: 'T4',
        axisValues: { [AXIS_ID_BUY_COUNT_GE2]: true },
        outcome: { nextDate: '2026-02-28', hit: {}, excludedReason: 'EXTREME_RETURN' },
      }),
    ];

    const result = computePerformanceDaily('DIR', 'US', '2026-02-27', samples, 1_700_000_000_000);

    expect(result.question).toBe('DIR');
    expect(result.market).toBe('US');
    expect(result.date).toBe('2026-02-27');
    expect(result.evaluatedCount).toBe(2);
    expect(result.hitCount).toBe(1);
    expect(result.createdAt).toBe(1_700_000_000_000);
  });

  it('点灯型軸（FLAG）は値が true のときだけ点灯として数える', () => {
    const samples: TickerSample[] = [
      tickerSample({
        tickerId: 'T1',
        axisValues: { [AXIS_ID_BUY_COUNT_GE2]: true },
        outcome: { nextDate: '2026-02-28', hit: { DIR: true } },
      }),
      tickerSample({
        tickerId: 'T2',
        axisValues: { [AXIS_ID_BUY_COUNT_GE2]: false },
        outcome: { nextDate: '2026-02-28', hit: { DIR: true } },
      }),
      tickerSample({
        tickerId: 'T3',
        axisValues: { [AXIS_ID_BUY_COUNT_GE2]: true },
        outcome: { nextDate: '2026-02-28', hit: { DIR: false } },
      }),
    ];

    const result = computePerformanceDaily('DIR', 'US', '2026-02-27', samples);

    expect(result.axisStats[AXIS_ID_BUY_COUNT_GE2]).toEqual({ count: 2, hitCount: 1 });
  });

  it('数値型軸（NUMERIC）は値が平常比 > 1（値 > 0）のときだけ点灯として数える', () => {
    const samples: TickerSample[] = [
      tickerSample({
        tickerId: 'T1',
        axisValues: { [AXIS_ID_RANGE_TODAY]: 0.2 },
        normal: { range: 0.03 },
        outcome: { nextDate: '2026-02-28', hit: { VOL: true } },
      }),
      tickerSample({
        tickerId: 'T2',
        axisValues: { [AXIS_ID_RANGE_TODAY]: -0.1 },
        normal: { range: 0.03 },
        outcome: { nextDate: '2026-02-28', hit: { VOL: false } },
      }),
      tickerSample({
        tickerId: 'T3',
        axisValues: { [AXIS_ID_RANGE_TODAY]: 0 },
        normal: { range: 0.03 },
        outcome: { nextDate: '2026-02-28', hit: { VOL: true } },
      }),
    ];

    const result = computePerformanceDaily('VOL', 'US', '2026-02-27', samples);

    // 点灯（値 > 0）は T1 のみ。T3 は値 0 のため非点灯。
    expect(result.axisStats[AXIS_ID_RANGE_TODAY]).toEqual({ count: 1, hitCount: 1 });
  });

  it('DIR のみ、点灯時の超過リターン合計を積む', () => {
    const samples: TickerSample[] = [
      tickerSample({
        tickerId: 'T1',
        axisValues: { [AXIS_ID_BUY_COUNT_GE2]: true },
        outcome: { nextDate: '2026-02-28', hit: { DIR: true }, excessReturn: 0.02 },
      }),
      tickerSample({
        tickerId: 'T2',
        axisValues: { [AXIS_ID_BUY_COUNT_GE2]: true },
        outcome: { nextDate: '2026-02-28', hit: { DIR: false }, excessReturn: -0.01 },
      }),
    ];

    const result = computePerformanceDaily('DIR', 'US', '2026-02-27', samples);

    expect(result.axisStats[AXIS_ID_BUY_COUNT_GE2]?.sumExcessReturn).toBeCloseTo(0.01, 10);
  });

  it('VOL では超過リターン合計を持たない', () => {
    const samples: TickerSample[] = [
      tickerSample({
        tickerId: 'T1',
        axisValues: { [AXIS_ID_RANGE_TODAY]: 0.2 },
        outcome: { nextDate: '2026-02-28', hit: { VOL: true } },
      }),
    ];

    const result = computePerformanceDaily('VOL', 'US', '2026-02-27', samples);

    expect(result.axisStats[AXIS_ID_RANGE_TODAY]?.sumExcessReturn).toBeUndefined();
  });

  it('確率帯（5pt 刻み）ごとの件数・的中数・確率の合計を集計する', () => {
    const samples: TickerSample[] = [
      tickerSample({
        tickerId: 'T1',
        outcome: { nextDate: '2026-02-28', hit: { DIR: true } },
        probabilities: { DIR: { probability: 0.52, baseline: 0.5 } },
      }),
      tickerSample({
        tickerId: 'T2',
        outcome: { nextDate: '2026-02-28', hit: { DIR: false } },
        probabilities: { DIR: { probability: 0.53, baseline: 0.5 } },
      }),
      tickerSample({
        tickerId: 'T3',
        outcome: { nextDate: '2026-02-28', hit: { DIR: true } },
        probabilities: { DIR: { probability: 0.61, baseline: 0.5 } },
      }),
      // 確率未算出（バーンイン前）: 帯には数えないが件数・的中数には数える
      tickerSample({
        tickerId: 'T4',
        outcome: { nextDate: '2026-02-28', hit: { DIR: true } },
      }),
    ];

    const result = computePerformanceDaily('DIR', 'US', '2026-02-27', samples);

    expect(result.evaluatedCount).toBe(4);
    expect(result.probabilityBands).toEqual([
      { lower: 0.5, upper: 0.55, count: 2, hitCount: 1, sumProbability: 1.05 },
      { lower: 0.6, upper: 0.65, count: 1, hitCount: 1, sumProbability: 0.61 },
    ]);
  });

  it('市場サンプル（MarketSample）から Q-MKT の集計を作る', () => {
    const samples: MarketSample[] = [
      {
        market: 'US',
        date: '2026-02-27',
        axisValues: { [AXIS_ID_MARKET_RANGE_AVG]: 0.15 },
        outcome: { nextDate: '2026-02-28', hit: { MKT: true } },
        probabilities: { MKT: { probability: 0.55, baseline: 0.4 } },
      },
      {
        market: 'US',
        date: '2026-02-27',
        axisValues: { [AXIS_ID_MARKET_RANGE_AVG]: -0.05 },
        outcome: { nextDate: '2026-02-28', hit: { MKT: false } },
      },
    ];

    const result = computePerformanceDaily('MKT', 'US', '2026-02-27', samples);

    expect(result.evaluatedCount).toBe(2);
    expect(result.hitCount).toBe(1);
    expect(result.axisStats[AXIS_ID_MARKET_RANGE_AVG]).toEqual({ count: 1, hitCount: 1 });
    expect(result.probabilityBands).toEqual([
      { lower: 0.55, upper: 0.6, count: 1, hitCount: 1, sumProbability: 0.55 },
    ]);
  });

  it('サンプルが 0 件なら全て 0 のアイテムを返す', () => {
    const result = computePerformanceDaily('DIR', 'JP', '2026-02-27', []);
    expect(result.evaluatedCount).toBe(0);
    expect(result.hitCount).toBe(0);
    expect(result.axisStats).toEqual({});
    expect(result.probabilityBands).toEqual([]);
  });
});
