/**
 * stock-tracker の撮影用データ。画面に出る値をすべてここで決め、毎回同じ画像になるようにする。
 * 初期データの形は、サービスの E2E が `/api/test/reset` に渡すものと同じ。
 */

/** SKIP_AUTH_CHECK=true のときにサービスが使う固定の利用者 ID */
export const TEST_USER_ID = 'test-user-id';

const DUMMY_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/spec-capture-subscription',
  keys: { p256dh: 'spec-capture-p256dh', auth: 'spec-capture-auth' },
};

export const EXCHANGES = [
  {
    exchangeId: 'ex-nasdaq',
    name: 'NASDAQ',
    key: 'NASDAQ',
    timezone: 'America/New_York',
    start: '09:30',
    end: '16:00',
    priceSource: 'finnhub',
    market: 'US',
  },
  {
    exchangeId: 'ex-tse',
    name: '東京証券取引所',
    key: 'TSE',
    timezone: 'Asia/Tokyo',
    start: '09:00',
    end: '15:30',
    priceSource: 'tradingview',
    market: 'JP',
  },
];

export const TICKERS = [
  { tickerId: 'NASDAQ:AAPL', symbol: 'AAPL', name: 'Apple Inc.', exchangeId: 'ex-nasdaq' },
  {
    tickerId: 'NASDAQ:MSFT',
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    exchangeId: 'ex-nasdaq',
  },
  { tickerId: 'TSE:7203', symbol: '7203', name: 'トヨタ自動車', exchangeId: 'ex-tse' },
];

export const HOLDINGS = [
  {
    userId: TEST_USER_ID,
    tickerId: 'NASDAQ:AAPL',
    exchangeId: 'ex-nasdaq',
    quantity: 50,
    averagePrice: 182.5,
    currency: 'USD',
  },
  {
    userId: TEST_USER_ID,
    tickerId: 'TSE:7203',
    exchangeId: 'ex-tse',
    quantity: 200,
    averagePrice: 2650,
    currency: 'JPY',
  },
];

const alertBase = {
  userId: TEST_USER_ID,
  frequency: 'MINUTE_LEVEL',
  enabled: true,
  subscription: DUMMY_SUBSCRIPTION,
};

export const ALERTS = [
  {
    ...alertBase,
    tickerId: 'NASDAQ:AAPL',
    exchangeId: 'ex-nasdaq',
    mode: 'Buy',
    conditionList: [{ field: 'price', operator: 'lte', value: 170 }],
  },
  {
    ...alertBase,
    tickerId: 'NASDAQ:AAPL',
    exchangeId: 'ex-nasdaq',
    mode: 'Sell',
    frequency: 'HOURLY_LEVEL',
    conditionList: [{ field: 'price', operator: 'gte', value: 220 }],
  },
  {
    ...alertBase,
    tickerId: 'TSE:7203',
    exchangeId: 'ex-tse',
    mode: 'Sell',
    enabled: false,
    conditionList: [
      { field: 'price', operator: 'gte', value: 2400 },
      { field: 'price', operator: 'lte', value: 3000 },
    ],
    logicalOperator: 'AND',
  },
  {
    ...alertBase,
    tickerId: 'NASDAQ:MSFT',
    exchangeId: 'ex-nasdaq',
    mode: 'Buy',
    temporary: true,
    temporaryExpireDate: '2026-03-03',
    conditionList: [{ field: 'price', operator: 'lte', value: 380 }],
  },
];

export const FULL_SEED = {
  exchanges: EXCHANGES,
  tickers: TICKERS,
  holdings: HOLDINGS,
  alerts: ALERTS,
};

export const EMPTY_SEED = { exchanges: EXCHANGES, tickers: TICKERS };

/** 最後の足の時刻。金曜の米国市場の引け (2026-02-27 16:00 ニューヨーク) */
const LAST_CANDLE_TIME = Date.UTC(2026, 1, 27, 21, 0, 0);

const TIMEFRAME_STEP_MS: Record<string, number> = {
  '1': 60_000,
  '5': 5 * 60_000,
  '60': 60 * 60_000,
  D: 24 * 60 * 60_000,
};

/** 毎回同じ値を返す疑似乱数。画像を毎回同じにするため `Math.random` は使わない */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** `/api/chart/{tickerId}` の応答。外部の価格取得を使わず、決まった値動きにする */
export function buildChartResponse(
  tickerId: string,
  timeframe: string,
  count: number,
  basePrice: number
): Record<string, unknown> {
  const step = TIMEFRAME_STEP_MS[timeframe] ?? TIMEFRAME_STEP_MS['60'];
  const random = createRandom(20260227);
  let close = basePrice;
  const data = [];
  for (let i = count - 1; i >= 0; i--) {
    const open = close;
    close = open + (random() - 0.48) * basePrice * 0.006 + Math.sin(i / 7) * basePrice * 0.001;
    const high = Math.max(open, close) + random() * basePrice * 0.003;
    const low = Math.min(open, close) - random() * basePrice * 0.003;
    data.push({
      time: LAST_CANDLE_TIME - i * step,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(900_000 + random() * 600_000),
    });
  }
  // チャート API は新しい足から順に返し、画面側が反転して時系列に並べる
  return { tickerId, symbol: tickerId.split(':')[1], timeframe, data: data.reverse() };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

interface ForecastFixture {
  probability: number;
  baseline: number;
  lean: string;
}

function summaryForecast(
  dir: ForecastFixture | null,
  vol: ForecastFixture | null,
  lit = { total: 0, buy: 0, sell: 0 }
) {
  return { dir, vol, lit };
}

const SUMMARY_DATE = '2026-02-27';
const SUMMARY_UPDATED_AT = '2026-02-27T22:10:00.000Z';

/** `/api/summaries/{tickerId}` と、一覧の 1 件分 */
export const TICKER_SUMMARIES: Record<string, Record<string, unknown>> = {
  'NASDAQ:AAPL': {
    tickerId: 'NASDAQ:AAPL',
    exchangeId: 'ex-nasdaq',
    date: SUMMARY_DATE,
    symbol: 'AAPL',
    name: 'Apple Inc.',
    open: 194.2,
    high: 197.8,
    low: 193.6,
    close: 196.4,
    volume: 48_213_500,
    updatedAt: SUMMARY_UPDATED_AT,
    buyPatternCount: 2,
    sellPatternCount: 1,
    buyAlertCount: { enabled: 1, disabled: 0 },
    sellAlertCount: { enabled: 1, disabled: 0 },
    holding: { quantity: 50, averagePrice: 182.5 },
    forecast: summaryForecast(
      { probability: 0.57, baseline: 0.5, lean: 'UP' },
      { probability: 0.64, baseline: 0.5, lean: 'HIGH' },
      { total: 3, buy: 2, sell: 1 }
    ),
  },
  'NASDAQ:MSFT': {
    tickerId: 'NASDAQ:MSFT',
    exchangeId: 'ex-nasdaq',
    date: SUMMARY_DATE,
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    open: 402.1,
    high: 404.5,
    low: 396.8,
    close: 398.3,
    volume: 21_904_300,
    updatedAt: SUMMARY_UPDATED_AT,
    buyPatternCount: 0,
    sellPatternCount: 1,
    buyAlertCount: { enabled: 1, disabled: 0 },
    sellAlertCount: { enabled: 0, disabled: 0 },
    holding: null,
    forecast: summaryForecast(
      { probability: 0.43, baseline: 0.5, lean: 'DOWN' },
      { probability: 0.41, baseline: 0.5, lean: 'NEUTRAL' },
      { total: 1, buy: 0, sell: 1 }
    ),
  },
  'TSE:7203': {
    tickerId: 'TSE:7203',
    exchangeId: 'ex-tse',
    date: '2026-02-27',
    symbol: '7203',
    name: 'トヨタ自動車',
    open: 2710,
    high: 2745,
    low: 2698,
    close: 2732,
    volume: 9_310_400,
    updatedAt: '2026-02-27T07:10:00.000Z',
    buyPatternCount: 0,
    sellPatternCount: 0,
    buyAlertCount: { enabled: 0, disabled: 0 },
    sellAlertCount: { enabled: 0, disabled: 1 },
    holding: { quantity: 200, averagePrice: 2650 },
    forecast: null,
  },
};

/** `/api/summaries` の応答 */
export const SUMMARIES_RESPONSE = {
  exchanges: [
    {
      exchangeId: 'ex-nasdaq',
      exchangeName: 'NASDAQ',
      date: SUMMARY_DATE,
      summaries: [TICKER_SUMMARIES['NASDAQ:AAPL'], TICKER_SUMMARIES['NASDAQ:MSFT']],
    },
    {
      exchangeId: 'ex-tse',
      exchangeName: '東京証券取引所',
      date: SUMMARY_DATE,
      summaries: [TICKER_SUMMARIES['TSE:7203']],
    },
  ],
  marketForecasts: [
    {
      market: 'JP',
      date: SUMMARY_DATE,
      forecast: { probability: 0.38, baseline: 0.45, lean: 'NEUTRAL', lowSample: false },
    },
    {
      market: 'US',
      date: SUMMARY_DATE,
      forecast: { probability: 0.62, baseline: 0.45, lean: 'HIGH', lowSample: true },
    },
  ],
};

export const EMPTY_SUMMARIES_RESPONSE = {
  exchanges: [
    { exchangeId: 'ex-nasdaq', exchangeName: 'NASDAQ', date: SUMMARY_DATE, summaries: [] },
  ],
  marketForecasts: SUMMARIES_RESPONSE.marketForecasts,
};

/** `/api/forecasts/{tickerId}` の応答 */
export const FORECAST_DETAIL_RESPONSE = {
  tickerId: 'NASDAQ:AAPL',
  date: SUMMARY_DATE,
  questions: {
    DIR: {
      probability: 0.57,
      baseline: 0.5,
      lean: 'UP',
      neutralBand: { lower: 0.47, upper: 0.53 },
      bandHistory: { lower: 0.55, upper: 0.6, count: 212, hitRate: 0.57 },
      axes: [
        {
          axisId: 'morning-star',
          name: '三川明けの明星',
          kind: 'FLAG',
          lit: true,
          performance: { count: 120, hitRate: 0.58, diffFromBaseline: 0.08 },
          contribution: 0.021,
          lowSample: false,
        },
        {
          axisId: 'range-5d',
          name: '直近 5 日の値幅',
          kind: 'NUMERIC',
          ratio: 1.42,
          performance: { count: 10, hitRate: 0.5, diffFromBaseline: 0 },
          contribution: -0.008,
          lowSample: true,
        },
        {
          axisId: 'evening-star',
          name: '三川宵の明星',
          kind: 'FLAG',
          lit: false,
          performance: { count: 90, hitRate: 0.45, diffFromBaseline: -0.05 },
          contribution: 0,
          lowSample: false,
        },
      ],
    },
    VOL: {
      probability: 0.64,
      baseline: 0.5,
      lean: 'HIGH',
      neutralBand: { lower: 0.47, upper: 0.53 },
      bandHistory: { lower: 0.6, upper: 0.65, count: 12, hitRate: 0.6 },
      axes: [
        {
          axisId: 'gap',
          name: 'ギャップ',
          kind: 'FLAG',
          lit: true,
          performance: { count: 40, hitRate: 0.7, diffFromBaseline: 0.2 },
          contribution: 0.05,
          lowSample: false,
        },
      ],
    },
  },
};

/** `/api/axis-performance` の応答。問い・市場ごとに差し替えて使う */
export const AXIS_PERFORMANCE_RESPONSE = {
  question: 'DIR',
  period: '90d',
  market: 'ALL',
  from: '2025-11-29',
  to: '2026-02-27',
  evaluatedCount: 8120,
  hitRate: 0.503,
  neutralBand: { lower: 0, upper: 0.05 },
  calibration: [
    { lower: 0.4, upper: 0.45, count: 1210, meanProbability: 0.43, hitRate: 0.44 },
    { lower: 0.45, upper: 0.5, count: 2980, meanProbability: 0.48, hitRate: 0.48 },
    { lower: 0.5, upper: 0.55, count: 3105, meanProbability: 0.52, hitRate: 0.53 },
    { lower: 0.55, upper: 0.6, count: 805, meanProbability: 0.57, hitRate: 0.58 },
    { lower: 0.6, upper: 0.65, count: 20, meanProbability: 0.62, hitRate: 0.7 },
  ],
  axes: [
    {
      axisId: 'morning-star',
      name: '三川明けの明星',
      kind: 'FLAG',
      count: 1200,
      hitRate: 0.55,
      diffFromBaseline: 0.047,
      meanExcessReturn: 0.003,
      currentWeight: 0.5,
      lowSample: false,
    },
    {
      axisId: 'range-5d',
      name: '直近 5 日の値幅',
      kind: 'NUMERIC',
      count: 980,
      hitRate: 0.49,
      diffFromBaseline: -0.013,
      meanExcessReturn: -0.0004,
      currentWeight: -0.1,
      lowSample: false,
    },
    {
      axisId: 'evening-star',
      name: '三川宵の明星',
      kind: 'FLAG',
      count: 20,
      hitRate: 0.45,
      diffFromBaseline: -0.053,
      meanExcessReturn: -0.001,
      currentWeight: -0.25,
      lowSample: true,
    },
  ],
};
