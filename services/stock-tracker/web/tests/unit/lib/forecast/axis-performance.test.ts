import {
  buildAxisPerformance,
  pickLatestSnapshot,
  resolvePeriodRange,
} from '../../../../lib/forecast/axis-performance';
import { performanceDaily, snapshot } from './fixtures';

describe('resolvePeriodRange', () => {
  it('データが無ければ null', () => {
    expect(resolvePeriodRange('30d', [])).toBeNull();
  });

  it('30d / 90d は最新日を含めて暦日で数える', () => {
    const dates = ['2026-05-30', '2026-01-01'];
    expect(resolvePeriodRange('30d', dates)).toEqual({ from: '2026-05-01', to: '2026-05-30' });
    expect(resolvePeriodRange('90d', dates)).toEqual({ from: '2026-03-02', to: '2026-05-30' });
  });

  it('all は最古の日から', () => {
    expect(resolvePeriodRange('all', ['2026-05-30', '2026-01-01'])).toEqual({
      from: '2026-01-01',
      to: '2026-05-30',
    });
  });
});

describe('pickLatestSnapshot', () => {
  it('日付が新しい方を選ぶ。全て null なら null', () => {
    const older = snapshot({ date: '2026-04-01' });
    const newer = snapshot({ date: '2026-05-01' });
    expect(pickLatestSnapshot([older, null, newer])).toBe(newer);
    expect(pickLatestSnapshot([newer, older])).toBe(newer);
    expect(pickLatestSnapshot([null])).toBeNull();
  });
});

describe('buildAxisPerformance', () => {
  const query = { question: 'DIR', period: '30d', market: 'ALL' } as const;

  it('データが無ければゼロ値で全軸を返し、from / to / neutralBand は null', () => {
    const result = buildAxisPerformance(query, [], null);
    expect(result).toMatchObject({
      from: null,
      to: null,
      evaluatedCount: 0,
      hitRate: 0,
      neutralBand: null,
      calibration: [],
    });
    expect(result.axes.length).toBeGreaterThan(20);
    expect(result.axes.every((a) => a.count === 0 && a.currentWeight === 0)).toBe(true);
    expect(result.axes.every((a) => a.diffFromBaseline === 0)).toBe(true);
    expect(result.axes.every((a) => a.meanExcessReturn === 0)).toBe(true);
  });

  it('JP・US を合算し、期間外を除く。確率帯は lower ごとに合算する', () => {
    const items = [
      performanceDaily({
        market: 'JP',
        date: '2026-05-30',
        evaluatedCount: 10,
        hitCount: 6,
        axisStats: { 'morning-star': { count: 4, hitCount: 3, sumExcessReturn: 0.04 } },
        probabilityBands: [
          { lower: 0.5, upper: 0.55, count: 6, hitCount: 3, sumProbability: 3.15 },
        ],
      }),
      performanceDaily({
        market: 'US',
        date: '2026-05-29',
        evaluatedCount: 10,
        hitCount: 4,
        axisStats: { 'morning-star': { count: 6, hitCount: 3, sumExcessReturn: 0.02 } },
        probabilityBands: [
          { lower: 0.55, upper: 0.6, count: 2, hitCount: 2, sumProbability: 1.14 },
          { lower: 0.5, upper: 0.55, count: 4, hitCount: 1, sumProbability: 2.1 },
        ],
      }),
      // 30 日の窓（2026-05-01 以降）より前
      performanceDaily({ date: '2026-04-30', evaluatedCount: 99, hitCount: 99 }),
    ];
    const result = buildAxisPerformance(
      query,
      items,
      snapshot({
        date: '2026-05-30',
        weights: { 'morning-star': 0.3 },
        neutralBand: { lower: -0.02, upper: 0.04, decidedOn: '2026-05-01' },
      })
    );

    expect(result.from).toBe('2026-05-01');
    expect(result.to).toBe('2026-05-30');
    expect(result.evaluatedCount).toBe(20);
    expect(result.hitRate).toBeCloseTo(0.5);
    expect(result.neutralBand).toEqual({ lower: -0.02, upper: 0.04 });
    expect(result.calibration).toEqual([
      { lower: 0.5, upper: 0.55, count: 10, meanProbability: 0.525, hitRate: 0.4 },
      { lower: 0.55, upper: 0.6, count: 2, meanProbability: 0.57, hitRate: 1 },
    ]);

    const morning = result.axes.find((a) => a.axisId === 'morning-star')!;
    expect(morning.count).toBe(10);
    expect(morning.hitRate).toBeCloseTo(0.6);
    expect(morning.diffFromBaseline).toBeCloseTo(0.1);
    expect(morning.meanExcessReturn).toBeCloseTo(0.006);
    expect(morning.currentWeight).toBe(0.3);
    expect(morning.lowSample).toBe(true);
  });

  it('all は最古の日から。件数が 30 以上の点灯型軸は lowSample ではない', () => {
    const items = [
      performanceDaily({
        date: '2026-01-01',
        evaluatedCount: 100,
        hitCount: 50,
        axisStats: { 'morning-star': { count: 30, hitCount: 15, sumExcessReturn: 0 } },
      }),
    ];
    const result = buildAxisPerformance({ ...query, period: 'all' }, items, null);
    expect(result.from).toBe('2026-01-01');
    expect(result.axes.find((a) => a.axisId === 'morning-star')!.lowSample).toBe(false);
  });

  it('VOL: 数値型軸は lowSample にならず、meanExcessReturn を持たない', () => {
    const result = buildAxisPerformance(
      { question: 'VOL', period: '30d', market: 'JP' },
      [
        performanceDaily({
          question: 'VOL',
          evaluatedCount: 5,
          hitCount: 2,
          axisStats: { 'parkinson-5d': { count: 1, hitCount: 1 } },
        }),
      ],
      null
    );
    const parkinson = result.axes.find((a) => a.axisId === 'parkinson-5d')!;
    expect(parkinson.kind).toBe('NUMERIC');
    expect(parkinson.lowSample).toBe(false);
    expect(parkinson).not.toHaveProperty('meanExcessReturn');
  });
});
