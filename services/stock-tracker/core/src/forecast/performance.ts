/**
 * Stock Tracker Core - 予測日ごとの採点済み件数の集計
 *
 * 成績画面・軸ごとの成績 API は、Forecast/MarketForecast を全件読まず、この集計結果
 * （日ごとの件数・的中数）を期間分合計して作る想定である。ここでは 1 日分の集計を
 * 保存済みサンプルから作る純粋関数だけを持つ。DB アクセス・期間分の合算は呼び出し側
 * （バッチ・API）が行う。
 */
import { getAxisDefinition, getAxisIdsForQuestion } from './axes.js';
import { PROBABILITY_BAND_STEP, type Market, type Question } from './constants.js';
import type { AxisId, MarketSample, TickerSample } from './types.js';

/** 軸ごとの 1 日分の集計（件数・的中数・超過リターン合計） */
export interface AxisPerformanceDailyEntry {
  /** 点灯回数（FLAG は値=true、NUMERIC は値>0 の回数） */
  count: number;
  /** 点灯時の的中数 */
  hitCount: number;
  /** DIR のみ。点灯時の超過リターンの合計（平均は期間集計後に合計件数で割って求める） */
  sumExcessReturn?: number;
}

/** 確率帯（5pt 刻み）ごとの 1 日分の集計（件数・的中数・確率の合計） */
export interface ProbabilityBandDailyEntry {
  /** 帯の下限（確率を 5pt 刻みにした値） */
  lower: number;
  upper: number;
  count: number;
  hitCount: number;
  /** 確率の合計（平均は期間集計後に合計件数で割って求める） */
  sumProbability: number;
}

/** 予測日ごとの採点済み件数の集計 */
export interface PerformanceDailyItem {
  question: Question;
  /** 算出した市場（ModelSnapshot と同じく「算出した市場 × 日」で持つ） */
  market: Market;
  /** 予測日 */
  date: string;
  /** 採点済み件数（除外分を除く） */
  evaluatedCount: number;
  /** 的中数 */
  hitCount: number;
  axisStats: Partial<Record<AxisId, AxisPerformanceDailyEntry>>;
  probabilityBands: ProbabilityBandDailyEntry[];
  createdAt: number;
}

/** 帯ごとの丸め（浮動小数点誤差を避けるため、小数第 8 位で丸める） */
function bandOf(value: number, step: number): number {
  const raw = Math.floor(value / step + 1e-9) * step;
  return Math.round(raw * 1e8) / 1e8;
}

/** 軸が「点灯」しているか（数値型軸は平常比 > 1、つまり値 > 0 を点灯とみなす） */
function isAxisLit(axisId: AxisId, value: number | boolean | undefined): boolean {
  if (value === undefined) return false;
  const kind = getAxisDefinition(axisId)?.kind ?? 'NUMERIC';
  return kind === 'FLAG' ? value === true || value === 1 : (value as number) > 0;
}

/** サンプルが銘柄サンプル（TickerSample）か（TickerSample だけが exchangeId を持つため、その有無で判定する） */
function isTickerSample(sample: TickerSample | MarketSample): sample is TickerSample {
  return 'exchangeId' in sample;
}

/** サンプルの採点結果から、その問いの Hit（的中したか）を取り出す。未採点・対象外は undefined */
function hitOf(question: Question, sample: TickerSample | MarketSample): boolean | undefined {
  const outcome = sample.outcome;
  if (outcome === undefined) return undefined;
  // 除外（極端リターン等）があるサンプルは Hit を持たないため自然に除外されるが、
  // 除外理由がある行を数えないことをここでも明示的に保証しておく。
  if ('excludedReason' in outcome && outcome.excludedReason !== undefined) return undefined;
  return (outcome.hit as Partial<Record<Question, boolean>>)[question];
}

/** サンプルのその問いの確率（未算出なら undefined） */
function probabilityOf(
  question: Question,
  sample: TickerSample | MarketSample
): number | undefined {
  return (
    sample.probabilities as
      | Partial<Record<Question, { probability: number; baseline: number }>>
      | undefined
  )?.[question]?.probability;
}

/**
 * 予測日 D の採点済みサンプル（同じ問い・同じ日のものに限る）から、1 日分の集計を作る。
 *
 * `samples` は呼び出し側があらかじめ対象日に絞って渡す（保存先が 1 日単位のため、他日の
 * サンプルが混ざっていても結果には影響しないが、無駄な走査になるため呼び出し側で絞ることを
 * 前提とする）。
 */
export function computePerformanceDaily(
  question: Question,
  market: Market,
  date: string,
  samples: readonly (TickerSample | MarketSample)[],
  now: number = Date.now()
): PerformanceDailyItem {
  const axisIds = getAxisIdsForQuestion(question);

  let evaluatedCount = 0;
  let hitCount = 0;
  const axisAcc = new Map<AxisId, { count: number; hitCount: number; sumExcessReturn?: number }>();
  const bandAcc = new Map<number, { count: number; hitCount: number; sumProbability: number }>();

  for (const sample of samples) {
    const hit = hitOf(question, sample);
    if (hit === undefined) continue;

    evaluatedCount += 1;
    if (hit) hitCount += 1;

    for (const axisId of axisIds) {
      const raw = sample.axisValues[axisId];
      if (!isAxisLit(axisId, raw)) continue;

      const entry = axisAcc.get(axisId) ?? { count: 0, hitCount: 0 };
      entry.count += 1;
      if (hit) entry.hitCount += 1;
      if (question === 'DIR' && isTickerSample(sample)) {
        const excessReturn = sample.outcome?.excessReturn;
        if (excessReturn !== undefined) {
          entry.sumExcessReturn = (entry.sumExcessReturn ?? 0) + excessReturn;
        }
      }
      axisAcc.set(axisId, entry);
    }

    const probability = probabilityOf(question, sample);
    if (probability !== undefined) {
      const band = bandOf(probability, PROBABILITY_BAND_STEP);
      const entry = bandAcc.get(band) ?? { count: 0, hitCount: 0, sumProbability: 0 };
      entry.count += 1;
      if (hit) entry.hitCount += 1;
      entry.sumProbability += probability;
      bandAcc.set(band, entry);
    }
  }

  const axisStats: Partial<Record<AxisId, AxisPerformanceDailyEntry>> = {};
  for (const [axisId, entry] of axisAcc) {
    axisStats[axisId] = entry;
  }

  const probabilityBands = [...bandAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lower, entry]) => ({
      lower,
      upper: Math.round((lower + PROBABILITY_BAND_STEP) * 1e8) / 1e8,
      count: entry.count,
      hitCount: entry.hitCount,
      sumProbability: entry.sumProbability,
    }));

  return {
    question,
    market,
    date,
    evaluatedCount,
    hitCount,
    axisStats,
    probabilityBands,
    createdAt: now,
  };
}
