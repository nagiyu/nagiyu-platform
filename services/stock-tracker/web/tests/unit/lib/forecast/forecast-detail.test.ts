import { buildForecastDetail, sortAxisBreakdowns } from '../../../../lib/forecast/forecast-detail';
import type { AxisBreakdown } from '../../../../types/forecast';
import { forecastEntity, probabilityRecord, snapshot } from './fixtures';

const axis = (overrides: Partial<AxisBreakdown>): AxisBreakdown => ({
  axisId: 'a',
  name: 'a',
  kind: 'FLAG',
  performance: { count: 0, hitRate: 0, diffFromBaseline: 0 },
  contribution: 0,
  lowSample: false,
  ...overrides,
});

describe('sortAxisBreakdowns', () => {
  it('寄与の絶対値の降順で並べ、点灯しなかった点灯型軸を末尾へ回す', () => {
    const sorted = sortAxisBreakdowns([
      axis({ axisId: 'unlit', lit: false, contribution: 0.5 }),
      axis({ axisId: 'small', lit: true, contribution: 0.01 }),
      axis({ axisId: 'negative', kind: 'NUMERIC', contribution: -0.05 }),
      axis({ axisId: 'unlit2', lit: false }),
    ]);
    expect(sorted.map((a) => a.axisId)).toEqual(['negative', 'small', 'unlit', 'unlit2']);
  });
});

describe('buildForecastDetail', () => {
  it('確度が無い問いは null にする', () => {
    const detail = buildForecastDetail(forecastEntity(), { DIR: null, VOL: null });
    expect(detail).toEqual({
      tickerId: 'NSDQ:AAPL',
      date: '2026-05-01',
      questions: { DIR: null, VOL: null },
    });
  });

  it('DIR: 全軸を返し、点灯・成績・寄与・件数不足を結合する', () => {
    const forecast = forecastEntity({
      AxisValues: { 'morning-star': true, 'evening-star': false },
      Probabilities: {
        DIR: probabilityRecord({
          bandHistory: { lower: 0.55, upper: 0.6, count: 40, hitRate: 0.58 },
          contributions: { 'morning-star': 0.03 },
          lowSampleAxes: ['evening-star'],
        }),
      },
    });
    const detail = buildForecastDetail(forecast, {
      DIR: snapshot({
        axisStats: {
          'morning-star': {
            count: 50,
            hitRate: 0.6,
            diffFromBaseline: 0.1,
            meanExcessReturn: 0.002,
            lowSample: false,
          },
        },
      }),
      VOL: null,
    });

    const dir = detail.questions.DIR!;
    expect(dir.neutralBand).toEqual({ lower: -0.05, upper: 0.05 });
    expect(dir.bandHistory).toEqual({ lower: 0.55, upper: 0.6, count: 40, hitRate: 0.58 });
    expect(dir.axes[0]).toEqual({
      axisId: 'morning-star',
      name: expect.any(String),
      kind: 'FLAG',
      lit: true,
      performance: { count: 50, hitRate: 0.6, diffFromBaseline: 0.1, meanExcessReturn: 0.002 },
      contribution: 0.03,
      lowSample: false,
    });
    const evening = dir.axes.find((a) => a.axisId === 'evening-star')!;
    expect(evening.lit).toBe(false);
    expect(evening.lowSample).toBe(true);
    expect(evening.performance).toEqual({ count: 0, hitRate: 0, diffFromBaseline: 0 });
    // 点灯しなかった軸は寄与に関わらず点灯した軸の後ろに来る
    const firstUnlit = dir.axes.findIndex((a) => a.lit === false);
    expect(dir.axes.slice(firstUnlit).every((a) => a.lit === false)).toBe(true);
  });

  it('VOL: 数値型軸は自然対数を平常比へ戻し、値が無ければ ratio を省略する。meanExcessReturn は付けない', () => {
    const forecast = forecastEntity({
      AxisValues: { 'parkinson-5d': Math.log(1.4) },
      Probabilities: { VOL: probabilityRecord({ lean: 'HIGH' }) },
    });
    const detail = buildForecastDetail(forecast, {
      DIR: null,
      VOL: snapshot({
        question: 'VOL',
        axisStats: {
          'parkinson-5d': {
            count: 10,
            hitRate: 0.5,
            diffFromBaseline: 0,
            meanExcessReturn: 0.1,
            lowSample: false,
          },
        },
      }),
    });

    const vol = detail.questions.VOL!;
    const parkinson = vol.axes.find((a) => a.axisId === 'parkinson-5d')!;
    expect(parkinson.kind).toBe('NUMERIC');
    expect(parkinson.ratio).toBeCloseTo(1.4, 10);
    expect(parkinson.lit).toBeUndefined();
    expect(parkinson.performance.meanExcessReturn).toBeUndefined();
    const rangeToday = vol.axes.find((a) => a.axisId === 'range-today')!;
    expect(rangeToday).not.toHaveProperty('ratio');
  });

  it('スナップショットが無くても成績はゼロ値で返す', () => {
    const forecast = forecastEntity({ Probabilities: { DIR: probabilityRecord() } });
    const detail = buildForecastDetail(forecast, { DIR: null, VOL: null });
    expect(detail.questions.DIR!.axes.every((a) => a.performance.count === 0)).toBe(true);
  });
});
