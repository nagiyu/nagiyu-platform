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
  /** NEUTRAL 予測比率（%）。judgedCount=0 なら null */
  neutralRatio: number | null;
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
  /**
   * 市場ベースレート（%）。
   * BULLISH→上昇率、BEARISH→下落率、NEUTRAL→フラット率。
   * n=0 なら null。
   */
  baseline: number | null;
  /**
   * エッジ（精度 − ベースライン、%）。
   * accuracy と baseline が両方 non-null のとき算出。どちらか null なら null。
   */
  edge: number | null;
}

export interface SummaryResponse {
  period: EvaluationPeriod;
  /** 集計時刻（unix timestamp ms） */
  evaluatedAt: number;
  /** 集計に使用した Hit 判定閾値 (%) */
  threshold: number;
  kpi: KpiSummary;
  dailyTrend: DailyTrendPoint[];
  bySignal: SignalAccuracyEntry[];
  /**
   * 市場ベースレート（全件を母数）。
   * n=0 なら 3 つとも null。
   */
  baseline: {
    /** 上昇率（ActualReturn >= +threshold の割合）(%) */
    upRate: number | null;
    /** 下落率（ActualReturn <= -threshold の割合）(%) */
    downRate: number | null;
    /** フラット率（-threshold < ActualReturn < +threshold の割合）(%) */
    flatRate: number | null;
  };
}
