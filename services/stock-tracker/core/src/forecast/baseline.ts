/**
 * Stock Tracker Core - 基準値（design.md §1.5、参照実装 analysis/decision.py の rolling_base 相当）
 */
import {
  BASELINE_CLIP_MAX,
  BASELINE_CLIP_MIN,
  BASELINE_MIN_COUNT,
  BASELINE_WINDOW,
  type Market,
} from './constants.js';
import { logit } from './stats.js';

/** 基準値の算出に使う既知サンプル（両市場合算） */
export interface BaselineKnownSample {
  market: Market;
  date: string;
  /** 名目引け時刻(サンプルの翌営業日, サンプルの市場) */
  labelTime: number;
  /** 目的変数（0/1） */
  y: number;
}

/**
 * 基準値（rolling_base, scope='pooled'）: 市場 M・日付 D の予測時点で知り得る、
 * 直近 BASELINE_WINDOW 営業日（M のカレンダー）のラベル付きサンプルの的中率（JP・US 合算）。
 * 20 件未満なら既知の全サンプル、それも無ければ 0.5（design.md §1.5）。
 *
 * calendar の全日付に対して baseline を返す（学習時のオフセット列と、表示する基準値の両方に使うため）。
 */
export function computeRollingBaseline(params: {
  calendar: Record<Market, readonly string[]>;
  /** 両市場合算の既知サンプル */
  samples: readonly BaselineKnownSample[];
  predTimeOf: (date: string, market: Market) => number;
  window?: number;
  minCount?: number;
}): Record<Market, Record<string, number>> {
  const window = params.window ?? BASELINE_WINDOW;
  const minCount = params.minCount ?? BASELINE_MIN_COUNT;
  const dates = params.samples.map((s) => s.date);
  const labelTimes = params.samples.map((s) => s.labelTime);
  const ys = params.samples.map((s) => s.y);

  const result: Record<Market, Record<string, number>> = { JP: {}, US: {} };
  for (const market of ['JP', 'US'] as const) {
    const calendar = params.calendar[market];
    for (let i = 0; i < calendar.length; i++) {
      const date = calendar[i];
      const predTime = params.predTimeOf(date, market);
      const lowerBoundDate = calendar[Math.max(0, i - window)];

      let recentSum = 0;
      let recentCount = 0;
      let knownSum = 0;
      let knownCount = 0;
      for (let k = 0; k < dates.length; k++) {
        if (labelTimes[k] > predTime) continue;
        knownSum += ys[k];
        knownCount += 1;
        if (dates[k] >= lowerBoundDate) {
          recentSum += ys[k];
          recentCount += 1;
        }
      }

      let baseline: number;
      if (recentCount >= minCount) {
        baseline = recentSum / recentCount;
      } else if (knownCount > 0) {
        baseline = knownSum / knownCount;
      } else {
        baseline = 0.5;
      }
      result[market][date] = baseline;
    }
  }
  return result;
}

/** 表示・オフセットに使う基準値は [0.02, 0.98] にクリップする（design.md §1.5） */
export function clipBaseline(baseline: number): number {
  return Math.min(BASELINE_CLIP_MAX, Math.max(BASELINE_CLIP_MIN, baseline));
}

/** クリップ後の基準値の logit（学習時のオフセット） */
export function baselineOffset(baseline: number): number {
  return logit(clipBaseline(baseline));
}
