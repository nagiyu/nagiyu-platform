/**
 * 予測精度ダッシュボード PoC 用モックデータ
 *
 * `tasks/stock-tracer-prediction-evaluation/tasks.md` § 作業 1 のスコープに従い、
 * `SummaryResponse` 型に準拠したハードコード JSON を提供する。
 *
 * バリエーション：
 * - 複数日（日次推移）
 * - シグナル別の偏りあり / なし
 * - 空状態（judgedCount = 0）
 * - 部分欠損（accuracy = null）
 *
 * 作業 7 で `use-prediction-evaluation.ts` から fetch 呼び出しに差し替えた時点で、
 * 本ファイルはテストフィクスチャに移動するか削除される予定。
 */

import type { EvaluationPeriod, SummaryResponse } from './types';

const NOW_MS = Date.UTC(2026, 4, 11, 12, 0, 0); // 2026-05-11 12:00 UTC（PoC 用の固定値）

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
    judgedCount: 54,
  },
  dailyTrend: DAILY_TREND_7D,
  bySignal: [
    { signal: 'BULLISH', accuracy: 70.0, count: 20 },
    { signal: 'NEUTRAL', accuracy: 66.7, count: 12 },
    { signal: 'BEARISH', accuracy: 54.5, count: 22 },
  ],
};

const MOCK_SUMMARY_30D: SummaryResponse = {
  period: '30d',
  evaluatedAt: NOW_MS,
  kpi: {
    totalAccuracy: 58.2,
    directionalAccuracy: 56.4,
    judgedCount: 218,
  },
  dailyTrend: DAILY_TREND_30D,
  bySignal: [
    { signal: 'BULLISH', accuracy: 61.0, count: 82 },
    { signal: 'NEUTRAL', accuracy: 60.5, count: 57 },
    { signal: 'BEARISH', accuracy: 53.8, count: 79 },
  ],
};

const MOCK_SUMMARY_90D: SummaryResponse = {
  period: '90d',
  evaluatedAt: NOW_MS,
  kpi: {
    totalAccuracy: 55.9,
    directionalAccuracy: 53.7,
    judgedCount: 642,
  },
  dailyTrend: DAILY_TREND_90D,
  bySignal: [
    { signal: 'BULLISH', accuracy: 57.2, count: 240 },
    { signal: 'NEUTRAL', accuracy: 58.3, count: 180 },
    { signal: 'BEARISH', accuracy: 51.0, count: 222 },
  ],
};

/** 全期間：判定済みが 0 件で「空状態」UI を確認できるよう意図的に空にする */
const MOCK_SUMMARY_ALL_EMPTY: SummaryResponse = {
  period: 'all',
  evaluatedAt: NOW_MS,
  kpi: {
    totalAccuracy: null,
    directionalAccuracy: null,
    judgedCount: 0,
  },
  dailyTrend: [],
  bySignal: [
    { signal: 'BULLISH', accuracy: null, count: 0 },
    { signal: 'NEUTRAL', accuracy: null, count: 0 },
    { signal: 'BEARISH', accuracy: null, count: 0 },
  ],
};

export const MOCK_SUMMARY_BY_PERIOD: Record<EvaluationPeriod, SummaryResponse> = {
  '7d': MOCK_SUMMARY_7D,
  '30d': MOCK_SUMMARY_30D,
  '90d': MOCK_SUMMARY_90D,
  all: MOCK_SUMMARY_ALL_EMPTY,
};
