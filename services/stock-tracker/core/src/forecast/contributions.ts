/**
 * Stock Tracker Core - 寄与の分解
 */
import { sigmoid } from './stats.js';
import type { AxisId } from './types.js';

export interface ContributionAxisInput {
  axisId: AxisId;
  /** 重み（標準化済み設計行列に対する係数） */
  weight: number;
  /** 標準化済みの値（点灯型は 0/1 のまま。値なしは 0） */
  standardizedValue: number;
}

/**
 * 基準値の logit から、|w_i * z_i| の大きい順に 1 軸ずつ足していき、そのたびの確率の増分を
 * その軸の寄与とする。合計は必ず「確率 − 基準値」に一致する。
 */
export function computeSequentialContributions(
  offsetLogit: number,
  axes: readonly ContributionAxisInput[]
): Record<AxisId, number> {
  const terms = axes.map((axis) => ({
    axisId: axis.axisId,
    term: axis.weight * axis.standardizedValue,
  }));
  terms.sort((a, b) => Math.abs(b.term) - Math.abs(a.term));

  let cur = offsetLogit;
  const result: Record<AxisId, number> = {};
  for (const { axisId, term } of terms) {
    const next = cur + term;
    result[axisId] = sigmoid(next) - sigmoid(cur);
    cur = next;
  }
  return result;
}
