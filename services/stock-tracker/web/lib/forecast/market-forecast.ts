/**
 * 市場の荒れ予報（MarketForecast）をレスポンスの形にまとめる
 */
import type {
  MarketForecastEntity,
  MarketForecastRepository,
  PerformanceDailyRepository,
} from '@nagiyu/stock-tracker-core';
import type { ForecastMarket, MarketForecastResponse } from '../../types/forecast';
import { EARLIEST_DATE, LOW_SAMPLE_MKT_DAYS } from './constants';
import { shiftDate } from './date';

/** 荒れ予報を常に返す市場（取引所マスタの Market と同じ集合） */
export const FORECAST_MARKETS: readonly ForecastMarket[] = ['JP', 'US'];

/**
 * 市場ごとの基準日を決める。
 * date 指定があればそれ、なければその市場に属する取引所で解決した日付のうち最新。
 * 解決できる取引所が無ければ null。
 */
export function resolveMarketDate(
  requestedDate: string | null,
  exchangeDates: readonly (string | null)[]
): string | null {
  if (requestedDate) {
    return requestedDate;
  }
  const resolved = exchangeDates.filter((date): date is string => date !== null);
  if (resolved.length === 0) {
    return null;
  }
  return resolved.reduce((latest, date) => (date > latest ? date : latest));
}

/** 採点済み日数が参考値のしきい値に満たないか */
export function isMarketLowSample(evaluatedDays: number): boolean {
  return evaluatedDays < LOW_SAMPLE_MKT_DAYS;
}

/** MarketForecast アイテムを荒れ予報のレスポンスにする */
export function toMarketForecastResponse(
  market: ForecastMarket,
  date: string | null,
  entity: MarketForecastEntity | null,
  evaluatedDays: number
): MarketForecastResponse {
  const record = entity?.Probabilities.MKT;
  if (!record) {
    return { market, date, forecast: null };
  }
  return {
    market,
    date,
    forecast: {
      probability: record.probability,
      baseline: record.baseline,
      lean: record.lean,
      lowSample: isMarketLowSample(evaluatedDays),
    },
  };
}

/**
 * 基準日より前に採点が済んでいる日数を数える。
 * 基準日当日の採点は翌営業日まで確定しないため、前日までで区切る。
 */
export async function countEvaluatedDays(
  performanceDailyRepository: PerformanceDailyRepository,
  market: ForecastMarket,
  date: string
): Promise<number> {
  const items = await performanceDailyRepository.getByPeriod(
    'MKT',
    market,
    EARLIEST_DATE,
    shiftDate(date, -1)
  );
  return items.filter((item) => item.evaluatedCount > 0).length;
}

/** 取引所で解決した日付と、その取引所の市場 */
export interface ExchangeResolvedDate {
  market: ForecastMarket | undefined;
  date: string | null;
}

/**
 * JP・US の荒れ予報を 2 件とも組み立てる。
 * 基準日を解決できない市場、または MarketForecast が無い市場は forecast を null にして返す。
 */
export async function buildMarketForecasts(
  repositories: {
    marketForecastRepository: MarketForecastRepository;
    performanceDailyRepository: PerformanceDailyRepository;
  },
  requestedDate: string | null,
  exchangeDates: readonly ExchangeResolvedDate[]
): Promise<MarketForecastResponse[]> {
  return Promise.all(
    FORECAST_MARKETS.map(async (market) => {
      const date = resolveMarketDate(
        requestedDate,
        exchangeDates.filter((entry) => entry.market === market).map((entry) => entry.date)
      );
      if (date === null) {
        return toMarketForecastResponse(market, null, null, 0);
      }
      const entity = await repositories.marketForecastRepository.getByMarketAndDate(market, date);
      const evaluatedDays = entity?.Probabilities.MKT
        ? await countEvaluatedDays(repositories.performanceDailyRepository, market, date)
        : 0;
      return toMarketForecastResponse(market, date, entity, evaluatedDays);
    })
  );
}
