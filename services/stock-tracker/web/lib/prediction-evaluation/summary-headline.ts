/**
 * 予測精度ダッシュボードの見出し直下に表示する主要指標テキストの組み立て。
 *
 * KPI カード形式から「見出し直下のテキスト 1 行」に集約したため、フォーマットは
 * 本ファイルに集約する。判定済み 0 件・null 精度などのエッジケースもここで吸収。
 */

import { PERIOD_LABELS, type EvaluationPeriod, type KpiSummary } from './types';

const NA = '—';

export const formatAccuracy = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return NA;
  }
  return `${value.toFixed(1)}%`;
};

export const formatJudgedCount = (value: number): string => value.toLocaleString('ja-JP');

export const buildSummaryHeadline = (period: EvaluationPeriod, kpi: KpiSummary): string => {
  const periodLabel = PERIOD_LABELS[period];
  if (kpi.judgedCount === 0) {
    return `${periodLabel}: 採点済みの予測がありません`;
  }
  return `${periodLabel}の方向精度: ${formatAccuracy(kpi.directionalAccuracy)}（採点 ${formatJudgedCount(
    kpi.judgedCount
  )} 件、総合精度 ${formatAccuracy(kpi.totalAccuracy)}）`;
};

export const buildLoadingHeadline = (period: EvaluationPeriod): string =>
  `${PERIOD_LABELS[period]}: 集計中...`;
