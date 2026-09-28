/**
 * Stock Tracker Core - 問いごとの合成モデル
 *
 * L2 正則化ロジスティック回帰（切片なし・オフセット付き）を、問いごとに JP/US 共通で学習する。
 */
import { getAxisDefinition } from './axes.js';
import { LOW_SAMPLE_AXIS_THRESHOLD, REGULARIZATION_ALPHA, type Question } from './constants.js';
import { fitLogisticRegression, meanAndPopulationStd, sigmoid } from './stats.js';
import type { AxisId, AxisStatsEntry } from './types.js';

/** 学習サンプル 1 行（軸の値・目的変数・オフセット） */
export interface TrainingRow {
  /** 軸の値（値が無い軸は notna().all に合わせて学習から除外する） */
  values: Partial<Record<AxisId, number>>;
  /** 目的変数（0/1） */
  y: number;
  /** そのサンプルの予測時点の基準値の logit */
  offset: number;
  /** 学習サンプルの異なる日付を数えるための日付 */
  date: string;
  /** DIR のみ: 超過リターン（AxisStats.meanExcessReturn 用） */
  excessReturn?: number;
}

export interface FittedQuestionModel {
  axisIds: readonly AxisId[];
  weights: Partial<Record<AxisId, number>>;
  standardization: Partial<Record<AxisId, { mean: number; std: number }>>;
  /** 学習に使ったサンプル数（行数） */
  trainingSize: number;
  /** 学習サンプルの異なる日付の数（バーンイン判定に使う） */
  distinctTrainingDates: number;
  axisStats: Partial<Record<AxisId, AxisStatsEntry>>;
}

/**
 * 軸の値が 1 つでも欠けている行（出来高欠損等）は学習から除外する。欠損を 0 として扱うと、
 * 実際には観測できていない軸まで学習に寄与してしまうため。
 */
function selectUsableRows(axisIds: readonly AxisId[], rows: readonly TrainingRow[]): TrainingRow[] {
  return rows.filter((row) => axisIds.every((id) => row.values[id] !== undefined));
}

/**
 * 問いごとのモデルを学習する。使えるサンプルが 0 件でも、重み 0 のモデルを返す
 * （呼び出し側がバーンイン判定で確率を出すかどうかを決める）。
 */
export function fitQuestionModel(
  question: Question,
  axisIds: readonly AxisId[],
  rows: readonly TrainingRow[]
): FittedQuestionModel {
  const usable = selectUsableRows(axisIds, rows);
  const numericAxisIds = axisIds.filter((id) => getAxisDefinition(id)?.kind === 'NUMERIC');

  const standardization: Record<AxisId, { mean: number; std: number }> = {};
  for (const axisId of numericAxisIds) {
    const values = usable.map((row) => row.values[axisId]!);
    standardization[axisId] = meanAndPopulationStd(values);
  }

  const design = usable.map((row) =>
    axisIds.map((axisId) => {
      const raw = row.values[axisId]!;
      const std = standardization[axisId];
      return std ? (raw - std.mean) / std.std : raw;
    })
  );
  const y = usable.map((row) => row.y);
  const offset = usable.map((row) => row.offset);

  const beta =
    usable.length > 0
      ? fitLogisticRegression({ design, y, offset, alpha: REGULARIZATION_ALPHA[question] })
      : axisIds.map(() => 0);

  const weights: Record<AxisId, number> = {};
  axisIds.forEach((axisId, i) => {
    weights[axisId] = beta[i];
  });

  const axisStats = computeAxisStats(question, axisIds, usable);
  const distinctTrainingDates = new Set(usable.map((row) => row.date)).size;

  return {
    axisIds,
    weights,
    standardization,
    trainingSize: usable.length,
    distinctTrainingDates,
    axisStats,
  };
}

/**
 * 軸ごとの成績。学習サンプル（notna().all を満たす行）での
 * 点灯回数・点灯時の的中率・全体との差・（DIR のみ）平均超過リターン・件数不足の目印。
 */
function computeAxisStats(
  question: Question,
  axisIds: readonly AxisId[],
  usable: readonly TrainingRow[]
): Record<AxisId, AxisStatsEntry> {
  const overallHitRate = usable.length > 0 ? mean(usable.map((r) => r.y)) : 0;
  const stats: Record<AxisId, AxisStatsEntry> = {};

  for (const axisId of axisIds) {
    const definition = getAxisDefinition(axisId);
    const kind = definition?.kind ?? 'NUMERIC';
    const litRows = usable.filter((row) => isAxisLit(kind, row.values[axisId]));
    const count = litRows.length;
    const hitRate = count > 0 ? mean(litRows.map((r) => r.y)) : 0;
    const entry: AxisStatsEntry = {
      count,
      hitRate,
      diffFromBaseline: hitRate - overallHitRate,
      lowSample: kind === 'FLAG' && count < LOW_SAMPLE_AXIS_THRESHOLD,
    };
    if (question === 'DIR') {
      const withExcess = litRows.filter((r) => r.excessReturn !== undefined);
      entry.meanExcessReturn =
        withExcess.length > 0 ? mean(withExcess.map((r) => r.excessReturn!)) : undefined;
    }
    stats[axisId] = entry;
  }
  return stats;
}

function isAxisLit(kind: 'FLAG' | 'NUMERIC', value: number | undefined): boolean {
  if (value === undefined) return false;
  return kind === 'FLAG' ? value === 1 : value > 0;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * 標準化済みの値を返す（値なしの軸は標準化後 0 として扱い、モデルへの寄与をなくす）。
 */
export function standardizeForPrediction(
  model: FittedQuestionModel,
  values: Partial<Record<AxisId, number>>
): Record<AxisId, number> {
  const result: Record<AxisId, number> = {};
  for (const axisId of model.axisIds) {
    const raw = values[axisId];
    const std = model.standardization[axisId];
    if (raw === undefined) {
      result[axisId] = 0;
      continue;
    }
    result[axisId] = std ? (raw - std.mean) / std.std : raw;
  }
  return result;
}

/** モデルの重み・オフセットから確率を計算する */
export function predictProbability(
  model: FittedQuestionModel,
  offsetLogit: number,
  standardizedValues: Record<AxisId, number>
): number {
  let eta = offsetLogit;
  for (const axisId of model.axisIds) {
    eta += (model.weights[axisId] ?? 0) * (standardizedValues[axisId] ?? 0);
  }
  return sigmoid(eta);
}
