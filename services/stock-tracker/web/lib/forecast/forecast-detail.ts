/**
 * Forecast アイテムと ModelSnapshot から、詳細ダイアログ用の確度の内訳を組み立てる
 * （サーバー側専用。core の軸定義を使う）
 */
import { getAxisDefinition, getAxisIdsForQuestion } from '@nagiyu/stock-tracker-core';
import type {
  AxisStatsEntry,
  ForecastEntity,
  ModelSnapshotItem,
  ProbabilityRecord,
} from '@nagiyu/stock-tracker-core';
import type { AxisBreakdown, ForecastDetailResponse, QuestionDetail } from '../../types/forecast';

type DetailQuestion = 'DIR' | 'VOL';

/** スナップショットに成績が無い軸（初出の軸など）の表示用ゼロ値 */
const EMPTY_AXIS_STATS: Pick<AxisStatsEntry, 'count' | 'hitRate' | 'diffFromBaseline'> = {
  count: 0,
  hitRate: 0,
  diffFromBaseline: 0,
};

function buildAxisBreakdown(
  question: DetailQuestion,
  axisId: string,
  forecast: ForecastEntity,
  record: ProbabilityRecord,
  snapshot: ModelSnapshotItem | null
): AxisBreakdown {
  const definition = getAxisDefinition(axisId);
  const kind = definition?.kind ?? 'NUMERIC';
  const value = forecast.AxisValues[axisId];
  const stats = snapshot?.axisStats[axisId];

  const performance: AxisBreakdown['performance'] = {
    count: stats?.count ?? EMPTY_AXIS_STATS.count,
    hitRate: stats?.hitRate ?? EMPTY_AXIS_STATS.hitRate,
    diffFromBaseline: stats?.diffFromBaseline ?? EMPTY_AXIS_STATS.diffFromBaseline,
  };
  if (question === 'DIR' && stats?.meanExcessReturn !== undefined) {
    performance.meanExcessReturn = stats.meanExcessReturn;
  }

  const breakdown: AxisBreakdown = {
    axisId,
    name: definition?.name ?? axisId,
    kind,
    performance,
    contribution: record.contributions[axisId] ?? 0,
    lowSample: record.lowSampleAxes.includes(axisId),
  };

  if (kind === 'FLAG') {
    breakdown.lit = value === true || value === 1;
  } else if (typeof value === 'number') {
    // 数値型軸は平常比の自然対数で保存しているため、表示用に平常比へ戻す
    breakdown.ratio = Math.exp(value);
  }
  return breakdown;
}

/** 寄与の絶対値の降順。点灯しなかった点灯型軸は末尾（元の並びを保つ） */
export function sortAxisBreakdowns(axes: readonly AxisBreakdown[]): AxisBreakdown[] {
  const isUnlit = (axis: AxisBreakdown): boolean => axis.kind === 'FLAG' && axis.lit === false;
  const active = axes.filter((axis) => !isUnlit(axis));
  const unlit = axes.filter(isUnlit);
  return [...active.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)), ...unlit];
}

function buildQuestionDetail(
  question: DetailQuestion,
  forecast: ForecastEntity,
  snapshot: ModelSnapshotItem | null
): QuestionDetail | null {
  const record = forecast.Probabilities[question];
  if (!record) {
    return null;
  }
  const axes = getAxisIdsForQuestion(question).map((axisId) =>
    buildAxisBreakdown(question, axisId, forecast, record, snapshot)
  );
  return {
    probability: record.probability,
    baseline: record.baseline,
    lean: record.lean,
    neutralBand: { lower: record.neutralBand.lower, upper: record.neutralBand.upper },
    bandHistory: record.bandHistory,
    axes: sortAxisBreakdowns(axes),
  };
}

/** 詳細ダイアログ用の確度の内訳（GET /api/forecasts/{tickerId} のレスポンス）を組み立てる */
export function buildForecastDetail(
  forecast: ForecastEntity,
  snapshots: Record<DetailQuestion, ModelSnapshotItem | null>
): ForecastDetailResponse {
  return {
    tickerId: forecast.TickerID,
    date: forecast.Date,
    questions: {
      DIR: buildQuestionDetail('DIR', forecast, snapshots.DIR),
      VOL: buildQuestionDetail('VOL', forecast, snapshots.VOL),
    },
  };
}
