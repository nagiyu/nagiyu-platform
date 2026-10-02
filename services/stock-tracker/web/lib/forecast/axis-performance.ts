/**
 * PerformanceDaily（予測日ごとの集計）を期間分合計して、軸ごとの成績を作る
 * （サーバー側専用。core の軸定義としきい値を使う）
 */
import {
  LOW_SAMPLE_AXIS_THRESHOLD,
  getAxisDefinition,
  getAxisIdsForQuestion,
} from '@nagiyu/stock-tracker-core';
import type { ModelSnapshotItem, PerformanceDailyItem } from '@nagiyu/stock-tracker-core';
import type {
  AxisPerformanceAxis,
  AxisPerformanceMarket,
  AxisPerformancePeriod,
  AxisPerformanceResponse,
  CalibrationBand,
  ForecastQuestion,
} from '../../types/forecast';
import { PERIOD_DAYS } from './constants';
import { shiftDate } from './date';

/** 期間の両端。データが無いときは null */
export function resolvePeriodRange(
  period: AxisPerformancePeriod,
  dates: readonly string[]
): { from: string; to: string } | null {
  if (dates.length === 0) {
    return null;
  }
  const sorted = [...dates].sort();
  const to = sorted[sorted.length - 1];
  if (period === 'all') {
    return { from: sorted[0], to };
  }
  return { from: shiftDate(to, -(PERIOD_DAYS[period] - 1)), to };
}

/** 複数市場のスナップショットのうち、日付が新しいものを選ぶ */
export function pickLatestSnapshot(
  snapshots: readonly (ModelSnapshotItem | null)[]
): ModelSnapshotItem | null {
  return snapshots.reduce<ModelSnapshotItem | null>(
    (latest, snapshot) =>
      snapshot && (!latest || snapshot.date > latest.date) ? snapshot : latest,
    null
  );
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function aggregateCalibration(items: readonly PerformanceDailyItem[]): CalibrationBand[] {
  const bands = new Map<
    number,
    { upper: number; count: number; hitCount: number; sumProbability: number }
  >();
  for (const item of items) {
    for (const band of item.probabilityBands) {
      const acc = bands.get(band.lower) ?? {
        upper: band.upper,
        count: 0,
        hitCount: 0,
        sumProbability: 0,
      };
      acc.count += band.count;
      acc.hitCount += band.hitCount;
      acc.sumProbability += band.sumProbability;
      bands.set(band.lower, acc);
    }
  }
  return [...bands.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lower, acc]) => ({
      lower,
      upper: acc.upper,
      count: acc.count,
      meanProbability: ratio(acc.sumProbability, acc.count),
      hitRate: ratio(acc.hitCount, acc.count),
    }));
}

function aggregateAxes(
  question: ForecastQuestion,
  items: readonly PerformanceDailyItem[],
  overallHitRate: number,
  snapshot: ModelSnapshotItem | null
): AxisPerformanceAxis[] {
  return getAxisIdsForQuestion(question).map((axisId) => {
    let count = 0;
    let hitCount = 0;
    let sumExcessReturn = 0;
    for (const item of items) {
      const entry = item.axisStats[axisId];
      if (!entry) continue;
      count += entry.count;
      hitCount += entry.hitCount;
      sumExcessReturn += entry.sumExcessReturn ?? 0;
    }
    const definition = getAxisDefinition(axisId);
    const kind = definition?.kind ?? 'NUMERIC';
    const hitRate = ratio(hitCount, count);
    const axis: AxisPerformanceAxis = {
      axisId,
      name: definition?.name ?? axisId,
      kind,
      count,
      hitRate,
      diffFromBaseline: count > 0 ? hitRate - overallHitRate : 0,
      currentWeight: snapshot?.weights[axisId] ?? 0,
      lowSample: kind === 'FLAG' && count < LOW_SAMPLE_AXIS_THRESHOLD,
    };
    if (question === 'DIR') {
      axis.meanExcessReturn = ratio(sumExcessReturn, count);
    }
    return axis;
  });
}

/**
 * 軸ごとの成績（GET /api/axis-performance のレスポンス）を組み立てる。
 *
 * @param items - 対象市場の PerformanceDaily（期間で絞る前の全件。ALL は JP・US を合わせて渡す）
 * @param snapshot - 対象市場の最新 ModelSnapshot（ALL は日付が新しい方）
 */
export function buildAxisPerformance(
  query: {
    question: ForecastQuestion;
    period: AxisPerformancePeriod;
    market: AxisPerformanceMarket;
  },
  items: readonly PerformanceDailyItem[],
  snapshot: ModelSnapshotItem | null
): AxisPerformanceResponse {
  const range = resolvePeriodRange(
    query.period,
    items.map((item) => item.date)
  );
  const inRange = range
    ? items.filter((item) => item.date >= range.from && item.date <= range.to)
    : [];

  const evaluatedCount = inRange.reduce((sum, item) => sum + item.evaluatedCount, 0);
  const hitCount = inRange.reduce((sum, item) => sum + item.hitCount, 0);
  const hitRate = ratio(hitCount, evaluatedCount);

  return {
    question: query.question,
    period: query.period,
    market: query.market,
    from: range?.from ?? null,
    to: range?.to ?? null,
    evaluatedCount,
    hitRate,
    neutralBand: snapshot
      ? { lower: snapshot.neutralBand.lower, upper: snapshot.neutralBand.upper }
      : null,
    calibration: aggregateCalibration(inRange),
    axes: aggregateAxes(query.question, inRange, hitRate, snapshot),
  };
}
