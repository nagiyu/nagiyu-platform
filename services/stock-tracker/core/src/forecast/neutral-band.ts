/**
 * Stock Tracker Core - 中立帯・確率帯の過去実績（design.md §1.5、参照実装 analysis/decision2.py 相当）
 */
import {
  NEUTRAL_BAND_MIN_DIFF,
  NEUTRAL_BAND_MIN_COUNT,
  NEUTRAL_BAND_REVIEW_INTERVAL_DAYS,
  NEUTRAL_BAND_SENTINEL_LOWER,
  NEUTRAL_BAND_SENTINEL_UPPER,
  NEUTRAL_BAND_SIGNIFICANCE_LEVEL,
  NEUTRAL_BAND_STEP,
  PROBABILITY_BAND_STEP,
  type Question,
} from './constants.js';
import { holmCorrection, twoSidedBinomialTest } from './stats.js';
import type { BandHistoryEntry, Lean, NeutralBand, NeutralBandState } from './types.js';

/** 中立帯の判定に使う 1 件（過去に出した予測とその採点結果） */
export interface NeutralBandHistoryPoint {
  /** 確率 − 基準値 */
  d: number;
  /** 採点結果（的中したか） */
  y: number;
  /** その予測時点の基準値 */
  base: number;
}

/** 帯ごとの丸め（浮動小数点誤差を避けるため、小数第 8 位で丸める） */
function bandOf(value: number, step: number): number {
  const raw = Math.floor(value / step + 1e-9) * step;
  return Math.round(raw * 1e8) / 1e8;
}

/**
 * 中立帯の判定（design.md §1.5、参照実装 decision2.py の determine_band）。
 *
 * hist を「確率 − 基準値」で step 刻みの帯に分け、各帯で実現率 vs その帯の基準値平均を
 * 両側二項検定、Holm 法で補正（有意水準 alpha）。基準値を含む帯から外側へ進み、
 * 最初に「有意 かつ 差の向きが合う かつ 差が minDiff 以上」の帯が出たら、その帯以遠を寄りありとする。
 * 条件を満たす帯が無い側は寄りなし（番兵値）。
 */
export function determineNeutralBand(
  hist: readonly NeutralBandHistoryPoint[],
  options: {
    step: number;
    minCount: number;
    minDiff?: number;
    alpha?: number;
  }
): NeutralBand {
  const { step, minCount } = options;
  const minDiff = options.minDiff ?? NEUTRAL_BAND_MIN_DIFF;
  const alpha = options.alpha ?? NEUTRAL_BAND_SIGNIFICANCE_LEVEL;

  const buckets = new Map<number, { n: number; k: number; baseSum: number }>();
  for (const point of hist) {
    const b = bandOf(point.d, step);
    const entry = buckets.get(b) ?? { n: 0, k: 0, baseSum: 0 };
    entry.n += 1;
    entry.k += point.y;
    entry.baseSum += point.base;
    buckets.set(b, entry);
  }

  const bands = [...buckets.entries()]
    .map(([b, e]) => ({ b, n: e.n, k: e.k, baseMean: e.baseSum / e.n }))
    .filter((band) => band.n >= minCount);

  if (bands.length === 0) {
    return { lower: NEUTRAL_BAND_SENTINEL_LOWER, upper: NEUTRAL_BAND_SENTINEL_UPPER };
  }

  const pValues = bands.map((band) => twoSidedBinomialTest(band.k, band.n, band.baseMean));
  const adjusted = holmCorrection(pValues);
  const significant = bands.map((band, i) => {
    const observedRate = band.k / band.n;
    const diff = observedRate - band.baseMean;
    return adjusted[i] < alpha && Math.abs(diff) >= minDiff;
  });
  const direction = bands.map((band) => Math.sign(band.k / band.n - band.baseMean));

  let upper = NEUTRAL_BAND_SENTINEL_UPPER;
  const upperCandidates = bands
    .map((band, i) => ({ ...band, i }))
    .filter((band) => band.b >= 0)
    .sort((a, b) => a.b - b.b);
  for (const band of upperCandidates) {
    if (significant[band.i] && direction[band.i] > 0) {
      upper = band.b;
      break;
    }
  }

  let lower = NEUTRAL_BAND_SENTINEL_LOWER;
  const lowerCandidates = bands
    .map((band, i) => ({ ...band, i }))
    .filter((band) => band.b < 0)
    .sort((a, b) => b.b - a.b);
  for (const band of lowerCandidates) {
    if (significant[band.i] && direction[band.i] < 0) {
      lower = band.b + step;
      break;
    }
  }

  return { lower, upper };
}

/** 問いのデフォルト設定で中立帯を判定する */
export function determineNeutralBandForQuestion(
  question: Question,
  hist: readonly NeutralBandHistoryPoint[]
): NeutralBand {
  return determineNeutralBand(hist, {
    step: NEUTRAL_BAND_STEP[question],
    minCount: NEUTRAL_BAND_MIN_COUNT[question],
  });
}

/**
 * 中立帯の見直し（design.md §1.5、参照実装 decision2.py の運用シミュレーション相当）。
 *
 * 直前の中立帯が null か、decidedOn より後で date 以下の**両市場を合わせたカレンダー**
 * （JP・US のサンプル日付の和集合）の日数が REVIEW_INTERVAL 以上なら判定し直す
 * （decidedOn = date）。それ以外は引き継ぐ。`decidedOn` がカレンダーに存在しない日付でも
 * 日付の大小比較で正しく数える（インデックス検索には依存しない）。
 *
 * `forceRecompute: true` を渡すと、上記の条件によらず必ず判定し直す（稼働開始日用）。
 */
export function resolveNeutralBandState(params: {
  question: Question;
  date: string;
  /** 両市場を合わせたカレンダー（JP・US のサンプル日付の和集合。ソート済み） */
  calendar: readonly string[];
  previous: NeutralBandState | null | undefined;
  hist: readonly NeutralBandHistoryPoint[];
  /** true なら見直し間隔によらず必ず判定し直す（稼働開始日など） */
  forceRecompute?: boolean;
}): NeutralBandState {
  const { previous, calendar, date, forceRecompute } = params;

  const shouldRecompute = (() => {
    if (forceRecompute) return true;
    if (previous === null || previous === undefined) return true;
    const elapsedDays = calendar.filter((d) => d > previous.decidedOn && d <= date).length;
    return elapsedDays >= NEUTRAL_BAND_REVIEW_INTERVAL_DAYS;
  })();

  if (!shouldRecompute && previous) {
    return previous;
  }

  const band = determineNeutralBandForQuestion(params.question, params.hist);
  return { ...band, decidedOn: date };
}

/**
 * 確率帯（5pt 刻み）ごとの過去実績（design.md §1.5「同じ確率帯の過去実績」、
 * 参照実装 wf.py の calib_table 相当）。
 */
export function computeBandHistoryTable(
  samples: readonly { probability: number; hit: number }[],
  step: number = PROBABILITY_BAND_STEP
): BandHistoryEntry[] {
  const buckets = new Map<number, { n: number; k: number }>();
  for (const sample of samples) {
    const b = bandOf(sample.probability, step);
    const entry = buckets.get(b) ?? { n: 0, k: 0 };
    entry.n += 1;
    entry.k += sample.hit;
    buckets.set(b, entry);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lower, e]) => ({
      lower,
      upper: Math.round((lower + step) * 1e8) / 1e8,
      count: e.n,
      hitRate: e.k / e.n,
    }));
}

/** 確率が属する帯の過去実績を探す（design.md §1.5・§2.3 bandHistory） */
export function findBandHistoryEntry(
  table: readonly BandHistoryEntry[],
  probability: number,
  step: number = PROBABILITY_BAND_STEP
): BandHistoryEntry | null {
  const b = bandOf(probability, step);
  return table.find((entry) => entry.lower === b) ?? null;
}

/**
 * 中立帯との比較結果（design.md §1.5・§2.3）。
 * DIR: d >= upper で UP、d < lower で DOWN、それ以外 NEUTRAL。
 * VOL・MKT: d >= upper で HIGH、それ以外 NEUTRAL。
 */
export function determineLean(question: Question, d: number, band: NeutralBand): Lean {
  if (question === 'DIR') {
    if (d >= band.upper) return 'UP';
    if (d < band.lower) return 'DOWN';
    return 'NEUTRAL';
  }
  return d >= band.upper ? 'HIGH' : 'NEUTRAL';
}
