/**
 * 判断軸の成績画面の表示定数
 *
 * client component から参照されるため core の値は import しない。
 */
import type {
  AxisPerformanceMarket,
  AxisPerformancePeriod,
  ForecastQuestion,
} from '../../types/forecast';

export const ERROR_MESSAGES = {
  UNAUTHORIZED: '判断軸の成績を表示する権限がありません。',
  VALIDATION: 'リクエストパラメータが不正です。',
  SERVER: 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。',
  FETCH_FAILED: '判断軸の成績の取得に失敗しました。',
} as const;

export const QUESTIONS: readonly ForecastQuestion[] = ['DIR', 'VOL', 'MKT'];

export const QUESTION_LABELS: Record<ForecastQuestion, string> = {
  DIR: '方向',
  VOL: '荒れ',
  MKT: '市場の荒れ',
};

/** 問いが何を当てる予測かの説明（軸の説明ツールチップに使う） */
export const QUESTION_MEANINGS: Record<ForecastQuestion, string> = {
  DIR: '翌営業日に市場平均を上回るか',
  VOL: '翌営業日に平常より荒れるか',
  MKT: '翌営業日に市場が平常より荒れるか',
};

export const PERIODS: readonly AxisPerformancePeriod[] = ['30d', '90d', 'all'];

export const PERIOD_LABELS: Record<AxisPerformancePeriod, string> = {
  '30d': '30 日',
  '90d': '90 日',
  all: '全期間',
};

export const MARKETS: readonly AxisPerformanceMarket[] = ['ALL', 'JP', 'US'];

export const MARKET_LABELS: Record<AxisPerformanceMarket, string> = {
  ALL: '全体',
  JP: 'JP',
  US: 'US',
};

export const DEFAULT_QUESTION: ForecastQuestion = 'DIR';
export const DEFAULT_PERIOD: AxisPerformancePeriod = '90d';
export const DEFAULT_MARKET: AxisPerformanceMarket = 'ALL';

/** 件数がこの値未満の確率帯は、実績が読めないため薄く表示する */
export const LOW_SAMPLE_BAND_COUNT = 30;

/** 中立帯の上下限がこの値のとき、その側は寄りなしを意味する番兵値 */
export const NEUTRAL_BAND_SENTINEL = { lower: -1, upper: 1 } as const;

export const EMPTY_MESSAGE = 'この期間に採点済みの予測はありません';
