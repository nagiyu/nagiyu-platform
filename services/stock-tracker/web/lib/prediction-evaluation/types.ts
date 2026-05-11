/**
 * 予測精度ダッシュボード API レスポンス型定義
 *
 * `tasks/stock-tracer-prediction-evaluation/design.md` §1.3 に準拠する。
 * 本 PoC 段階では作業 6（精度集計 API）未実装のため、`mock-data.ts` で
 * これらの型を満たすハードコード JSON を返す。作業 2 の PoC FB 反映で
 * 内容（フィールド構成）が変わる可能性あり。
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
  /** NEUTRAL 比率（%） */
  neutralRatio: number | null;
  /** 判定済み件数 */
  judgedCount: number;
  /** 採点対象外（AiAnalysisError あり）件数 */
  aiFailureCount: number;
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

export interface ExchangeAccuracyEntry {
  exchangeId: string;
  exchangeName: string;
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
  byExchange: ExchangeAccuracyEntry[];
}

export interface TickerAccuracyEntry {
  tickerId: string;
  tickerName: string;
  exchangeId: string;
  /** 方向精度ベース（NEUTRAL 除外） */
  accuracy: number;
  count: number;
  bullishHit: number;
  bullishTotal: number;
  bearishHit: number;
  bearishTotal: number;
}

export interface TickersResponse {
  period: EvaluationPeriod;
  minCount: number;
  tickers: TickerAccuracyEntry[];
}
