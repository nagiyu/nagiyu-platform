import type {
  MarketForecastRepository,
  PerformanceDailyRepository,
} from '@nagiyu/stock-tracker-core';
import {
  buildMarketForecasts,
  countEvaluatedDays,
  isMarketLowSample,
  resolveMarketDate,
  toMarketForecastResponse,
} from '../../../../lib/forecast/market-forecast';
import { LOW_SAMPLE_MKT_DAYS } from '../../../../lib/forecast/constants';
import { performanceDaily, probabilityRecord } from './fixtures';

const marketEntity = (lean: 'HIGH' | 'NEUTRAL' = 'HIGH') =>
  ({
    Market: 'JP',
    Date: '2026-05-01',
    Probabilities: { MKT: probabilityRecord({ probability: 0.4, baseline: 0.3, lean }) },
  }) as never;

describe('resolveMarketDate', () => {
  it('指定日があればそれを使う', () => {
    expect(resolveMarketDate('2026-05-01', ['2026-04-30'])).toBe('2026-05-01');
  });

  it('指定が無ければ解決できた日付のうち最新を使う', () => {
    expect(resolveMarketDate(null, ['2026-04-30', null, '2026-05-02'])).toBe('2026-05-02');
  });

  it('解決できる日付が無ければ null', () => {
    expect(resolveMarketDate(null, [null])).toBeNull();
    expect(resolveMarketDate(null, [])).toBeNull();
  });
});

describe('isMarketLowSample', () => {
  it('しきい値未満は true、以上は false', () => {
    expect(isMarketLowSample(LOW_SAMPLE_MKT_DAYS - 1)).toBe(true);
    expect(isMarketLowSample(LOW_SAMPLE_MKT_DAYS)).toBe(false);
  });
});

describe('toMarketForecastResponse', () => {
  it('MarketForecast が無ければ forecast は null', () => {
    expect(toMarketForecastResponse('JP', '2026-05-01', null, 0)).toEqual({
      market: 'JP',
      date: '2026-05-01',
      forecast: null,
    });
  });

  it('確度が空なら forecast は null', () => {
    const entity = { Probabilities: {} } as never;
    expect(toMarketForecastResponse('US', '2026-05-01', entity, 0).forecast).toBeNull();
  });

  it('確度があれば lowSample つきで返す', () => {
    expect(toMarketForecastResponse('JP', '2026-05-01', marketEntity(), 300).forecast).toEqual({
      probability: 0.4,
      baseline: 0.3,
      lean: 'HIGH',
      lowSample: false,
    });
  });
});

describe('countEvaluatedDays', () => {
  it('基準日の前日までの採点済み日数（evaluatedCount > 0）を数える', async () => {
    const getByPeriod = jest
      .fn()
      .mockResolvedValue([
        performanceDaily({ evaluatedCount: 1 }),
        performanceDaily({ evaluatedCount: 0 }),
        performanceDaily({ evaluatedCount: 5 }),
      ]);

    const days = await countEvaluatedDays(
      { getByPeriod } as unknown as PerformanceDailyRepository,
      'JP',
      '2026-03-01'
    );

    expect(days).toBe(2);
    expect(getByPeriod).toHaveBeenCalledWith('MKT', 'JP', '0000-01-01', '2026-02-28');
  });
});

describe('buildMarketForecasts', () => {
  const setup = () => {
    const getByMarketAndDate = jest.fn();
    const getByPeriod = jest.fn().mockResolvedValue([]);
    return {
      getByMarketAndDate,
      getByPeriod,
      repositories: {
        marketForecastRepository: { getByMarketAndDate } as unknown as MarketForecastRepository,
        performanceDailyRepository: { getByPeriod } as unknown as PerformanceDailyRepository,
      },
    };
  };

  it('JP・US を常に 2 件返し、日付を解決できない市場は null', async () => {
    const { repositories, getByMarketAndDate } = setup();
    getByMarketAndDate.mockResolvedValue(marketEntity());

    const result = await buildMarketForecasts(repositories, null, [
      { market: 'JP', date: '2026-05-01' },
      { market: undefined, date: '2026-05-09' },
    ]);

    expect(result.map((r) => r.market)).toEqual(['JP', 'US']);
    expect(result[0].date).toBe('2026-05-01');
    expect(result[0].forecast?.lowSample).toBe(true);
    expect(result[1]).toEqual({ market: 'US', date: null, forecast: null });
    expect(getByMarketAndDate).toHaveBeenCalledTimes(1);
  });

  it('MarketForecast が無い市場は成績を引かない', async () => {
    const { repositories, getByMarketAndDate, getByPeriod } = setup();
    getByMarketAndDate.mockResolvedValue(null);

    const result = await buildMarketForecasts(repositories, '2026-05-01', []);

    expect(result).toEqual([
      { market: 'JP', date: '2026-05-01', forecast: null },
      { market: 'US', date: '2026-05-01', forecast: null },
    ]);
    expect(getByPeriod).not.toHaveBeenCalled();
  });
});
