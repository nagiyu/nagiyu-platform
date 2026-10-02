import { PATTERN_REGISTRY } from '@nagiyu/stock-tracker-core';
import {
  countLitPatterns,
  indexForecastsByTicker,
  toProbabilityView,
  toTickerForecastSummary,
} from '../../../../lib/forecast/ticker-forecast';
import { forecastEntity, probabilityRecord } from './fixtures';

const buyId = PATTERN_REGISTRY.find((p) => p.definition.signalType === 'BUY')!.definition.patternId;
const sellId = PATTERN_REGISTRY.find((p) => p.definition.signalType === 'SELL')!.definition
  .patternId;

describe('toProbabilityView', () => {
  it('確度が無ければ null', () => {
    expect(toProbabilityView(undefined)).toBeNull();
  });

  it('確率・基準値・傾きだけを返す', () => {
    expect(toProbabilityView(probabilityRecord({ lean: 'DOWN' }))).toEqual({
      probability: 0.56,
      baseline: 0.5,
      lean: 'DOWN',
    });
  });
});

describe('countLitPatterns', () => {
  it('単一パターンの点灯を買い・売りに分けて数える（true と 1 の両方）', () => {
    expect(countLitPatterns({ [buyId]: true, [sellId]: 1 })).toEqual({
      total: 2,
      buy: 1,
      sell: 1,
    });
  });

  it('複合軸・数値型軸・false は数えない', () => {
    expect(
      countLitPatterns({
        [buyId]: false,
        'buy-count-ge2': true,
        'sell-count-ge2': true,
        'parkinson-5d': 1,
      })
    ).toEqual({ total: 0, buy: 0, sell: 0 });
  });
});

describe('toTickerForecastSummary', () => {
  it('Forecast が無ければ null', () => {
    expect(toTickerForecastSummary(null)).toBeNull();
    expect(toTickerForecastSummary(undefined)).toBeNull();
  });

  it('DIR・VOL の有無を個別に反映する', () => {
    const summary = toTickerForecastSummary(
      forecastEntity({
        AxisValues: { [buyId]: true },
        Probabilities: { VOL: probabilityRecord({ lean: 'HIGH' }) },
      })
    );
    expect(summary).toEqual({
      dir: null,
      vol: { probability: 0.56, baseline: 0.5, lean: 'HIGH' },
      lit: { total: 1, buy: 1, sell: 0 },
    });
  });
});

describe('indexForecastsByTicker', () => {
  it('銘柄 ID で引ける', () => {
    const forecast = forecastEntity({ TickerID: 'NSDQ:MSFT' });
    expect(indexForecastsByTicker([forecast]).get('NSDQ:MSFT')).toBe(forecast);
  });
});
