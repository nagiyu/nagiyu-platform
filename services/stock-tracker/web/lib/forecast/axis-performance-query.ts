/**
 * GET /api/axis-performance のクエリの検証
 */
import type {
  AxisPerformanceMarket,
  AxisPerformancePeriod,
  ForecastQuestion,
} from '../../types/forecast';
import { AXIS_PERFORMANCE_DEFAULTS } from './constants';

export interface AxisPerformanceQuery {
  question: ForecastQuestion;
  period: AxisPerformancePeriod;
  market: AxisPerformanceMarket;
}

export type AxisPerformanceQueryError =
  | 'INVALID_QUESTION'
  | 'INVALID_PERIOD'
  | 'INVALID_MARKET'
  | 'MARKET_ALL_NOT_ALLOWED';

const QUESTIONS: readonly ForecastQuestion[] = ['DIR', 'VOL', 'MKT'];
const PERIODS: readonly AxisPerformancePeriod[] = ['30d', '90d', 'all'];
const MARKETS: readonly AxisPerformanceMarket[] = ['ALL', 'JP', 'US'];

function pick<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T
): T | undefined {
  if (raw === null) {
    return fallback;
  }
  return allowed.find((value) => value === raw);
}

/** クエリ文字列を検証し、省略値を既定値で補う。不正なら理由を返す */
export function parseAxisPerformanceQuery(
  params: URLSearchParams
): { ok: true; query: AxisPerformanceQuery } | { ok: false; error: AxisPerformanceQueryError } {
  const question = pick(params.get('question'), QUESTIONS, AXIS_PERFORMANCE_DEFAULTS.question);
  if (!question) {
    return { ok: false, error: 'INVALID_QUESTION' };
  }
  const period = pick(params.get('period'), PERIODS, AXIS_PERFORMANCE_DEFAULTS.period);
  if (!period) {
    return { ok: false, error: 'INVALID_PERIOD' };
  }
  const market = pick(params.get('market'), MARKETS, AXIS_PERFORMANCE_DEFAULTS.market);
  if (!market) {
    return { ok: false, error: 'INVALID_MARKET' };
  }
  // Q-MKT は市場ごとに 1 日 1 件で、JP と US を合算する意味が無い
  if (question === 'MKT' && market === 'ALL') {
    return { ok: false, error: 'MARKET_ALL_NOT_ALLOWED' };
  }
  return { ok: true, query: { question, period, market } };
}
