/**
 * Stock Tracker Core - Forecast (確度) 型定義
 *
 * design.md §2.3 の論理モデル（ProbabilityRecord / ModelSnapshotItem 等）に対応する。
 * DB のキー設計（PK/SK/GSI）は含まない純粋なビジネスオブジェクトのみを持つ（entities/ と同じ方針）。
 */
import type { PatternResults } from '../types.js';
import type { Market, Question } from './constants.js';

export type { Market, Question } from './constants.js';

/** 軸の種類。点灯型（0/1）か数値型（対数比） */
export type AxisKind = 'FLAG' | 'NUMERIC';

/** 軸 ID（パターン軸は patternId そのもの。複合・大きさ・市場レベル軸は固定 ID） */
export type AxisId = string;

/** 判断軸の定義（design.md §1.2・§1.3。DB には持たずコードで持つ） */
export interface AxisDefinition {
  axisId: AxisId;
  /** 日本語名 */
  name: string;
  kind: AxisKind;
  /** この軸を使う問い（design.md §1.3 の対応を固定） */
  questions: readonly Question[];
}

/** 中立帯（「確率 − 基準値」の範囲） */
export interface NeutralBand {
  lower: number;
  upper: number;
}

/** ModelSnapshot に保存する中立帯（見直し日つき） */
export interface NeutralBandState extends NeutralBand {
  decidedOn: string;
}

/** 確率帯（5pt 刻み）ごとの過去実績 */
export interface BandHistoryEntry {
  lower: number;
  upper: number;
  count: number;
  hitRate: number;
}

/** 中立帯との比較結果 */
export type Lean = 'UP' | 'DOWN' | 'HIGH' | 'NEUTRAL';

/** 問いごとの確度（予測時点の値。一度書いたら書き換えない。design.md §2.3） */
export interface ProbabilityRecord {
  probability: number;
  baseline: number;
  neutralBand: NeutralBand;
  bandHistory: BandHistoryEntry | null;
  lean: Lean;
  /** 寄与（確率の差）。値なし・寄与ゼロの軸は省略してよい */
  contributions: Partial<Record<AxisId, number>>;
  /** 件数不足で重みがゼロ寄りの軸（点灯型のみ） */
  lowSampleAxes: AxisId[];
}

/** 軸ごとの成績（ModelSnapshot.AxisStats） */
export interface AxisStatsEntry {
  count: number;
  hitRate: number;
  diffFromBaseline: number;
  /** DIR のみ */
  meanExcessReturn?: number;
  lowSample: boolean;
}

/** その日の算出に使った重み・基準値・中立帯・成績のスナップショット（design.md §2.3） */
export interface ModelSnapshotItem {
  question: Question;
  /** 算出した市場（タイミング）。モデル自体は JP/US 共通 */
  market: Market;
  date: string;
  modelVersion: string;
  alpha: number;
  weights: Partial<Record<AxisId, number>>;
  /** 数値型軸のみ */
  standardization: Partial<Record<AxisId, { mean: number; std: number }>>;
  baseline: number;
  neutralBand: NeutralBandState;
  bandHistory: BandHistoryEntry[];
  axisStats: Partial<Record<AxisId, AxisStatsEntry>>;
  trainingSize: number;
  createdAt: number;
}

/** 銘柄×日の算出結果（Forecast アイテムの予測部分に対応） */
export interface TickerForecastResult {
  tickerId: string;
  exchangeId: string;
  market: Market;
  date: string;
  /** 軸の値・点灯状態（予測時点） */
  axisValues: Partial<Record<AxisId, number | boolean>>;
  /** 算出に使った平常 */
  normal: { range?: number; volume?: number };
  probabilities: Partial<Record<'DIR' | 'VOL', ProbabilityRecord>>;
}

/** 市場×日の算出結果（MarketForecast アイテムの予測部分に対応） */
export interface MarketForecastResult {
  market: Market;
  date: string;
  axisValues: Partial<Record<AxisId, number>>;
  probabilities: Partial<Record<'MKT', ProbabilityRecord>>;
}

/** computeForDate の戻り値 */
export interface ComputeForDateResult {
  date: string;
  market: Market;
  tickers: TickerForecastResult[];
  marketForecast: MarketForecastResult;
  modelSnapshots: Partial<Record<Question, ModelSnapshotItem>>;
}

/**
 * computeForDate への入力の 1 行（DailySummary 相当）。
 *
 * PK/SK 等 DynamoDB の実装詳細は含まない。CreatedAt は #3830 の過去データ除外でのみ使う。
 */
export interface DailyBarInput {
  tickerId: string;
  exchangeId: string;
  /** 取引日 (YYYY-MM-DD) */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  patternResults?: PatternResults;
  /** 作成日時 (Unix timestamp ms)。#3830 の除外2（途中足）でのみ使う */
  createdAt: number;
}

/**
 * 既知の（採点済みで、時刻の規則により参照してよい）過去の予測 1 件。
 * 中立帯の判定・確率帯の過去実績にのみ使う（学習・基準値は DailyBarInput から再計算する）。
 */
export interface KnownProbabilitySample {
  market: Market;
  /** 予測日 */
  date: string;
  probability: number;
  baseline: number;
  /** 採点結果（的中したか） */
  hit: boolean;
}

/** computeForDate に渡す履歴（NFR-4: DB アクセスは呼び出し側に閉じる） */
export interface ForecastHistory {
  /** 全市場の DailySummary 相当。将来のバーも含めてよい（時刻の規則で内部フィルタする） */
  bars: readonly DailyBarInput[];
  /** 既知の Q-DIR 予測（採点済み） */
  knownDirSamples: readonly KnownProbabilitySample[];
  /** 既知の Q-VOL 予測（採点済み） */
  knownVolSamples: readonly KnownProbabilitySample[];
  /** 既知の Q-MKT 予測（採点済み） */
  knownMktSamples: readonly KnownProbabilitySample[];
  /** 問いごとの直前の中立帯（design.md §1.5 見直しの規則）。なければ null または省略 */
  previousNeutralBands?: Partial<Record<Question, NeutralBandState | null>>;
}

/** 銘柄×日の採点結果（Forecast.Outcome に対応） */
export interface TickerOutcome {
  tickerId: string;
  exchangeId: string;
  market: Market;
  /** 予測日 */
  date: string;
  nextDate: string;
  /** 翌営業日の終値リターン（実際の値。除外時も参考値として持つ） */
  nextReturn: number;
  /**
   * 超過リターン（同日・同市場の有効銘柄平均との差）。
   * 極端リターンで除外された行は、参照実装で ret1 が NaN 扱いになり超過リターンも算出できないため省略する。
   */
  excessReturn?: number;
  /** 翌営業日の値幅（生値。実際の値。除外時も参考値として持つ） */
  nextRange: number;
  /** 翌日値幅 ÷ 平常。平常が算出できない、または極端リターンで除外されたときは省略 */
  rangeRatio?: number;
  hit: Partial<Record<'DIR' | 'VOL', boolean>>;
  excludedReason?: 'EXTREME_RETURN';
  evaluatedAt: number;
}

/** 市場×日の採点結果（MarketForecast.Outcome に対応） */
export interface MarketOutcome {
  market: Market;
  date: string;
  nextDate: string;
  nextRange: number;
  /** 翌日値幅 ÷ 平常。平常（直近20市場日平均）が算出できないときは省略 */
  rangeRatio?: number;
  hit: Partial<Record<'MKT', boolean>>;
  evaluatedAt: number;
}

/** computeOutcomes の戻り値 */
export interface ComputeOutcomesResult {
  tickerOutcomes: TickerOutcome[];
  marketOutcomes: MarketOutcome[];
}
