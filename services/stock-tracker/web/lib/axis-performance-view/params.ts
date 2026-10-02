import type { AxisPerformanceMarket, ForecastQuestion } from '../../types/forecast';

/**
 * 問いに合わせて市場の選択を寄せる。
 * 市場の荒れは市場ごとに 1 日 1 件で JP と US を合算する意味が無いため、ALL のままにしない。
 */
export function normalizeMarket(
  question: ForecastQuestion,
  market: AxisPerformanceMarket
): AxisPerformanceMarket {
  return question === 'MKT' && market === 'ALL' ? 'JP' : market;
}
