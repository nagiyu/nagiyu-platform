/**
 * 予測精度ダッシュボード PoC 用モックデータ
 *
 * `tasks/stock-tracer-prediction-evaluation/tasks.md` § 作業 1 のスコープに従い、
 * `SummaryResponse` / `TickersResponse` 型に準拠したハードコード JSON を提供する。
 *
 * バリエーション：
 * - 複数日 / 複数銘柄 / 複数取引所
 * - 高精度ケース・低精度ケース
 * - 空状態（judgedCount = 0）
 * - 部分欠損（accuracy = null）
 *
 * 作業 7 で `use-prediction-evaluation.ts` から fetch 呼び出しに差し替えた時点で、
 * 本ファイルはテストフィクスチャに移動するか削除される予定。
 */

import type {
  EvaluationPeriod,
  SummaryResponse,
  TickersResponse,
} from './types';

const NOW_MS = Date.UTC(2026, 4, 11, 12, 0, 0); // 2026-05-11 12:00 UTC（PoC 用の固定値）

const EXCHANGE_NASDAQ = { id: 'NASDAQ', name: 'NASDAQ' };
const EXCHANGE_TSE = { id: 'TSE', name: '東京証券取引所' };
const EXCHANGE_NYSE = { id: 'NYSE', name: 'NYSE' };

/** 期間ごとの日次推移サンプル */
const DAILY_TREND_7D = [
  { date: '2026-05-04', directionalAccuracy: 66.7, judgedCount: 9 },
  { date: '2026-05-05', directionalAccuracy: 55.6, judgedCount: 9 },
  { date: '2026-05-06', directionalAccuracy: null, judgedCount: 0 }, // 部分欠損
  { date: '2026-05-07', directionalAccuracy: 75.0, judgedCount: 8 },
  { date: '2026-05-08', directionalAccuracy: 50.0, judgedCount: 10 },
  { date: '2026-05-09', directionalAccuracy: 62.5, judgedCount: 8 },
  { date: '2026-05-10', directionalAccuracy: 70.0, judgedCount: 10 },
];

const DAILY_TREND_30D = [
  ...Array.from({ length: 23 }, (_, i) => {
    const day = 11 + i;
    const directionalAccuracy = i % 7 === 4 ? null : 50 + ((i * 13) % 35);
    const judgedCount = i % 7 === 4 ? 0 : 6 + (i % 5);
    return {
      date: `2026-04-${String(day).padStart(2, '0')}`,
      directionalAccuracy,
      judgedCount,
    };
  }),
  ...DAILY_TREND_7D,
];

const DAILY_TREND_90D = Array.from({ length: 83 }, (_, i) => {
  const base = new Date(Date.UTC(2026, 1, 12)).getTime();
  const date = new Date(base + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const directionalAccuracy = i % 11 === 7 ? null : 48 + ((i * 7) % 40);
  const judgedCount = i % 11 === 7 ? 0 : 5 + (i % 7);
  return { date, directionalAccuracy, judgedCount };
}).concat(DAILY_TREND_7D);

const MOCK_SUMMARY_7D: SummaryResponse = {
  period: '7d',
  evaluatedAt: NOW_MS,
  kpi: {
    totalAccuracy: 64.8,
    directionalAccuracy: 63.5,
    neutralRatio: 22.2,
    judgedCount: 54,
    aiFailureCount: 3,
  },
  dailyTrend: DAILY_TREND_7D,
  bySignal: [
    { signal: 'BULLISH', accuracy: 70.0, count: 20 },
    { signal: 'NEUTRAL', accuracy: 66.7, count: 12 },
    { signal: 'BEARISH', accuracy: 54.5, count: 22 },
  ],
  byExchange: [
    {
      exchangeId: EXCHANGE_NASDAQ.id,
      exchangeName: EXCHANGE_NASDAQ.name,
      accuracy: 71.4,
      count: 21,
    },
    {
      exchangeId: EXCHANGE_TSE.id,
      exchangeName: EXCHANGE_TSE.name,
      accuracy: 58.3,
      count: 24,
    },
    {
      exchangeId: EXCHANGE_NYSE.id,
      exchangeName: EXCHANGE_NYSE.name,
      accuracy: null, // 部分欠損
      count: 9,
    },
  ],
};

const MOCK_SUMMARY_30D: SummaryResponse = {
  period: '30d',
  evaluatedAt: NOW_MS,
  kpi: {
    totalAccuracy: 58.2,
    directionalAccuracy: 56.4,
    neutralRatio: 26.1,
    judgedCount: 218,
    aiFailureCount: 11,
  },
  dailyTrend: DAILY_TREND_30D,
  bySignal: [
    { signal: 'BULLISH', accuracy: 61.0, count: 82 },
    { signal: 'NEUTRAL', accuracy: 60.5, count: 57 },
    { signal: 'BEARISH', accuracy: 53.8, count: 79 },
  ],
  byExchange: [
    {
      exchangeId: EXCHANGE_NASDAQ.id,
      exchangeName: EXCHANGE_NASDAQ.name,
      accuracy: 62.1,
      count: 87,
    },
    {
      exchangeId: EXCHANGE_TSE.id,
      exchangeName: EXCHANGE_TSE.name,
      accuracy: 55.4,
      count: 92,
    },
    {
      exchangeId: EXCHANGE_NYSE.id,
      exchangeName: EXCHANGE_NYSE.name,
      accuracy: 48.7,
      count: 39,
    },
  ],
};

const MOCK_SUMMARY_90D: SummaryResponse = {
  period: '90d',
  evaluatedAt: NOW_MS,
  kpi: {
    totalAccuracy: 55.9,
    directionalAccuracy: 53.7,
    neutralRatio: 28.0,
    judgedCount: 642,
    aiFailureCount: 34,
  },
  dailyTrend: DAILY_TREND_90D,
  bySignal: [
    { signal: 'BULLISH', accuracy: 57.2, count: 240 },
    { signal: 'NEUTRAL', accuracy: 58.3, count: 180 },
    { signal: 'BEARISH', accuracy: 51.0, count: 222 },
  ],
  byExchange: [
    {
      exchangeId: EXCHANGE_NASDAQ.id,
      exchangeName: EXCHANGE_NASDAQ.name,
      accuracy: 59.4,
      count: 261,
    },
    {
      exchangeId: EXCHANGE_TSE.id,
      exchangeName: EXCHANGE_TSE.name,
      accuracy: 54.8,
      count: 270,
    },
    {
      exchangeId: EXCHANGE_NYSE.id,
      exchangeName: EXCHANGE_NYSE.name,
      accuracy: 49.2,
      count: 111,
    },
  ],
};

/** 全期間：判定済みが 0 件で「空状態」UI を確認できるよう意図的に空にする */
const MOCK_SUMMARY_ALL_EMPTY: SummaryResponse = {
  period: 'all',
  evaluatedAt: NOW_MS,
  kpi: {
    totalAccuracy: null,
    directionalAccuracy: null,
    neutralRatio: null,
    judgedCount: 0,
    aiFailureCount: 0,
  },
  dailyTrend: [],
  bySignal: [
    { signal: 'BULLISH', accuracy: null, count: 0 },
    { signal: 'NEUTRAL', accuracy: null, count: 0 },
    { signal: 'BEARISH', accuracy: null, count: 0 },
  ],
  byExchange: [],
};

export const MOCK_SUMMARY_BY_PERIOD: Record<EvaluationPeriod, SummaryResponse> = {
  '7d': MOCK_SUMMARY_7D,
  '30d': MOCK_SUMMARY_30D,
  '90d': MOCK_SUMMARY_90D,
  all: MOCK_SUMMARY_ALL_EMPTY,
};

const MOCK_TICKERS_7D: TickersResponse = {
  period: '7d',
  minCount: 5,
  tickers: [
    {
      tickerId: 'NASDAQ:NVDA',
      tickerName: 'NVIDIA Corporation',
      exchangeId: EXCHANGE_NASDAQ.id,
      accuracy: 83.3,
      count: 6,
      bullishHit: 4,
      bullishTotal: 4,
      bearishHit: 1,
      bearishTotal: 2,
    },
    {
      tickerId: 'NASDAQ:AAPL',
      tickerName: 'Apple Inc.',
      exchangeId: EXCHANGE_NASDAQ.id,
      accuracy: 71.4,
      count: 7,
      bullishHit: 3,
      bullishTotal: 4,
      bearishHit: 2,
      bearishTotal: 3,
    },
    {
      tickerId: 'TSE:7203',
      tickerName: 'トヨタ自動車',
      exchangeId: EXCHANGE_TSE.id,
      accuracy: 62.5,
      count: 8,
      bullishHit: 3,
      bullishTotal: 5,
      bearishHit: 2,
      bearishTotal: 3,
    },
    {
      tickerId: 'TSE:6758',
      tickerName: 'ソニーグループ',
      exchangeId: EXCHANGE_TSE.id,
      accuracy: 50.0,
      count: 6,
      bullishHit: 2,
      bullishTotal: 4,
      bearishHit: 1,
      bearishTotal: 2,
    },
    {
      tickerId: 'NYSE:KO',
      tickerName: 'The Coca-Cola Company',
      exchangeId: EXCHANGE_NYSE.id,
      accuracy: 40.0,
      count: 5,
      bullishHit: 1,
      bullishTotal: 3,
      bearishHit: 1,
      bearishTotal: 2,
    },
    {
      tickerId: 'NASDAQ:GOOG',
      tickerName: 'Alphabet Inc.',
      exchangeId: EXCHANGE_NASDAQ.id,
      accuracy: 33.3,
      count: 6,
      bullishHit: 1,
      bullishTotal: 3,
      bearishHit: 1,
      bearishTotal: 3,
    },
  ],
};

const MOCK_TICKERS_30D: TickersResponse = {
  period: '30d',
  minCount: 5,
  tickers: [
    {
      tickerId: 'NASDAQ:NVDA',
      tickerName: 'NVIDIA Corporation',
      exchangeId: EXCHANGE_NASDAQ.id,
      accuracy: 75.0,
      count: 24,
      bullishHit: 12,
      bullishTotal: 15,
      bearishHit: 6,
      bearishTotal: 9,
    },
    {
      tickerId: 'NASDAQ:AAPL',
      tickerName: 'Apple Inc.',
      exchangeId: EXCHANGE_NASDAQ.id,
      accuracy: 66.7,
      count: 27,
      bullishHit: 11,
      bullishTotal: 16,
      bearishHit: 7,
      bearishTotal: 11,
    },
    {
      tickerId: 'TSE:7203',
      tickerName: 'トヨタ自動車',
      exchangeId: EXCHANGE_TSE.id,
      accuracy: 60.7,
      count: 28,
      bullishHit: 9,
      bullishTotal: 14,
      bearishHit: 8,
      bearishTotal: 14,
    },
    {
      tickerId: 'TSE:6758',
      tickerName: 'ソニーグループ',
      exchangeId: EXCHANGE_TSE.id,
      accuracy: 56.0,
      count: 25,
      bullishHit: 8,
      bullishTotal: 14,
      bearishHit: 6,
      bearishTotal: 11,
    },
    {
      tickerId: 'NYSE:KO',
      tickerName: 'The Coca-Cola Company',
      exchangeId: EXCHANGE_NYSE.id,
      accuracy: 47.6,
      count: 21,
      bullishHit: 5,
      bullishTotal: 11,
      bearishHit: 5,
      bearishTotal: 10,
    },
    {
      tickerId: 'NASDAQ:GOOG',
      tickerName: 'Alphabet Inc.',
      exchangeId: EXCHANGE_NASDAQ.id,
      accuracy: 42.3,
      count: 26,
      bullishHit: 5,
      bullishTotal: 13,
      bearishHit: 6,
      bearishTotal: 13,
    },
  ],
};

const MOCK_TICKERS_90D: TickersResponse = {
  period: '90d',
  minCount: 5,
  tickers: [
    {
      tickerId: 'NASDAQ:NVDA',
      tickerName: 'NVIDIA Corporation',
      exchangeId: EXCHANGE_NASDAQ.id,
      accuracy: 68.4,
      count: 76,
      bullishHit: 32,
      bullishTotal: 46,
      bearishHit: 20,
      bearishTotal: 30,
    },
    {
      tickerId: 'NASDAQ:AAPL',
      tickerName: 'Apple Inc.',
      exchangeId: EXCHANGE_NASDAQ.id,
      accuracy: 61.5,
      count: 78,
      bullishHit: 28,
      bullishTotal: 44,
      bearishHit: 20,
      bearishTotal: 34,
    },
    {
      tickerId: 'TSE:7203',
      tickerName: 'トヨタ自動車',
      exchangeId: EXCHANGE_TSE.id,
      accuracy: 56.8,
      count: 81,
      bullishHit: 24,
      bullishTotal: 40,
      bearishHit: 22,
      bearishTotal: 41,
    },
    {
      tickerId: 'TSE:6758',
      tickerName: 'ソニーグループ',
      exchangeId: EXCHANGE_TSE.id,
      accuracy: 52.6,
      count: 76,
      bullishHit: 21,
      bullishTotal: 38,
      bearishHit: 19,
      bearishTotal: 38,
    },
    {
      tickerId: 'NYSE:KO',
      tickerName: 'The Coca-Cola Company',
      exchangeId: EXCHANGE_NYSE.id,
      accuracy: 45.2,
      count: 62,
      bullishHit: 14,
      bullishTotal: 32,
      bearishHit: 14,
      bearishTotal: 30,
    },
    {
      tickerId: 'NASDAQ:GOOG',
      tickerName: 'Alphabet Inc.',
      exchangeId: EXCHANGE_NASDAQ.id,
      accuracy: 41.3,
      count: 75,
      bullishHit: 16,
      bullishTotal: 39,
      bearishHit: 15,
      bearishTotal: 36,
    },
  ],
};

const MOCK_TICKERS_ALL_EMPTY: TickersResponse = {
  period: 'all',
  minCount: 5,
  tickers: [],
};

export const MOCK_TICKERS_BY_PERIOD: Record<EvaluationPeriod, TickersResponse> = {
  '7d': MOCK_TICKERS_7D,
  '30d': MOCK_TICKERS_30D,
  '90d': MOCK_TICKERS_90D,
  all: MOCK_TICKERS_ALL_EMPTY,
};
