/**
 * 予測精度ダッシュボード API レスポンス型定義
 *
 * `tasks/stock-tracer-prediction-evaluation/design.md` §1.3 に準拠する。
 */

export type EvaluationPeriod = '7d' | '30d' | '90d' | 'all';

export const EVALUATION_PERIODS: readonly EvaluationPeriod[] = ['7d', '30d', '90d', 'all'];

export const PERIOD_LABELS: Record<EvaluationPeriod, string> = {
  '7d': '直近 7 日',
  '30d': '直近 30 日',
  '90d': '直近 90 日',
  all: '全期間',
};

export type PredictedSignal = 'BULLISH' | 'NEUTRAL' | 'BEARISH';

export const SIGNAL_LABELS: Record<PredictedSignal, string> = {
  BULLISH: '強気（BULLISH）',
  NEUTRAL: '中立（NEUTRAL）',
  BEARISH: '弱気（BEARISH）',
};

export interface KpiSummary {
  /** 総合精度（%）。判定済み 0 件なら null */
  totalAccuracy: number | null;
  /** 方向精度（%、BULLISH + BEARISH のみ） */
  directionalAccuracy: number | null;
  /** 判定済み件数 */
  judgedCount: number;
}

export interface DailyTrendPoint {
  /** YYYY-MM-DD */
  date: string;
  directionalAccuracy: number | null;
  judgedCount: number;
}

export interface SignalAccuracyEntry {
  signal: PredictedSignal;
  accuracy: number | null;
  count: number;
}

export interface SummaryResponse {
  period: EvaluationPeriod;
  /** 集計時刻（unix timestamp ms） */
  evaluatedAt: number;
  kpi: KpiSummary;
  dailyTrend: DailyTrendPoint[];
  bySignal: SignalAccuracyEntry[];
}
