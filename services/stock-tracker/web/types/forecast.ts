/**
 * 確度 API のレスポンス型
 *
 * client component からも参照されるため、実行時の値を持たず import も持たない
 * （core の値を client バンドルへ持ち込まないため）。
 */

/** 強含み / 弱含み / 荒れそう / 中立・平常 */
export type Lean = 'UP' | 'DOWN' | 'HIGH' | 'NEUTRAL';

/** 問い（Q-DIR / Q-VOL / Q-MKT） */
export type ForecastQuestion = 'DIR' | 'VOL' | 'MKT';

/** 市場 */
export type ForecastMarket = 'JP' | 'US';

/** 一覧・カード用の確度の要約 */
export interface ProbabilityView {
  /** 0〜1。DIR は P(市場平均を上回る)、VOL・MKT は P(平常より荒れる) */
  probability: number;
  baseline: number;
  /** 中立帯との比較結果（算出時に確定して保存したもの） */
  lean: Lean;
}

/** 銘柄の確度の要約（一覧・詳細の TickerSummary に載せる） */
export interface TickerForecastSummary {
  dir: ProbabilityView | null;
  vol: ProbabilityView | null;
  /** 合致した単一パターンの数（複合軸は数えない） */
  lit: { total: number; buy: number; sell: number };
}

/** 市場の荒れ予報 */
export interface MarketForecastResponse {
  market: ForecastMarket;
  /** 基準日。基準日を解決できる取引所が無いときは null */
  date: string | null;
  /** 算出なし・失敗は null */
  forecast: (ProbabilityView & { lowSample: boolean }) | null;
}

export interface NeutralBandView {
  lower: number;
  upper: number;
}

export interface BandHistoryView {
  lower: number;
  upper: number;
  count: number;
  hitRate: number;
}

export interface AxisBreakdown {
  axisId: string;
  name: string;
  kind: 'FLAG' | 'NUMERIC';
  /** FLAG のみ */
  lit?: boolean;
  /** NUMERIC のみ。平常比（例: 1.4） */
  ratio?: number;
  /** 算出時点の成績 */
  performance: {
    count: number;
    hitRate: number;
    diffFromBaseline: number;
    /** DIR のみ */
    meanExcessReturn?: number;
  };
  /** 寄与（確率の差、-1〜1） */
  contribution: number;
  lowSample: boolean;
}

export interface QuestionDetail {
  probability: number;
  baseline: number;
  lean: Lean;
  neutralBand: NeutralBandView;
  bandHistory: BandHistoryView | null;
  /** 寄与の絶対値の降順。点灯しなかった点灯型軸は lit=false で末尾 */
  axes: AxisBreakdown[];
}

export interface ForecastDetailResponse {
  tickerId: string;
  date: string;
  questions: {
    DIR: QuestionDetail | null;
    VOL: QuestionDetail | null;
  };
}

export type AxisPerformancePeriod = '30d' | '90d' | 'all';
export type AxisPerformanceMarket = 'ALL' | ForecastMarket;

export interface CalibrationBand {
  lower: number;
  upper: number;
  count: number;
  meanProbability: number;
  hitRate: number;
}

export interface AxisPerformanceAxis {
  axisId: string;
  name: string;
  kind: 'FLAG' | 'NUMERIC';
  /** FLAG は点灯回数、NUMERIC は平常より高かった回数 */
  count: number;
  hitRate: number;
  diffFromBaseline: number;
  /** DIR のみ */
  meanExcessReturn?: number;
  currentWeight: number;
  lowSample: boolean;
}

export interface AxisPerformanceResponse {
  question: ForecastQuestion;
  period: AxisPerformancePeriod;
  market: AxisPerformanceMarket;
  /** 集計対象のデータが 1 件も無いときは null */
  from: string | null;
  to: string | null;
  evaluatedCount: number;
  hitRate: number;
  neutralBand: NeutralBandView | null;
  calibration: CalibrationBand[];
  axes: AxisPerformanceAxis[];
}
