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

/**
 * 軸ごとの成績（ModelSnapshot.AxisStats）。
 *
 * `diffFromBaseline` は「点灯時の的中率 − 学習サンプル全体の的中率」（design.md §1.4・点12）。
 * 60 営業日窓の「基準値」（baseline.ts）とは別の量で、あくまで学習に使った全サンプルとの比較。
 */
export interface AxisStatsEntry {
  /** 点灯回数（FLAG は値=1、NUMERIC は値>0 の回数） */
  count: number;
  /** 点灯時の的中率 */
  hitRate: number;
  /** 点灯時の的中率 − 学習サンプル全体の的中率 */
  diffFromBaseline: number;
  /** DIR のみ。点灯時の平均超過リターン */
  meanExcessReturn?: number;
  /** 件数不足の目印（点灯型のみ。count < LOW_SAMPLE_AXIS_THRESHOLD） */
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
  /** 学習に使ったサンプル数（行数） */
  trainingSize: number;
  /**
   * 学習サンプルの異なる日付の数（design.md §1.6 のバーンイン判定に使う実装拡張フィールド。
   * design.md の型スケッチには無いが、スナップショット単体からバーンイン可否を判定できるように持つ）。
   */
  distinctTrainingDates: number;
  createdAt: number;
}

/**
 * 銘柄×日の軸の値（`computeAxisValuesForDate` の戻り値。design.md §1「D の足と直近の履歴 → 軸の値」）。
 * まだ実績・確率は含まない（Outcome は翌営業日の到着後、Probabilities はスナップショット計算後に決まる）。
 */
export interface TickerAxisValues {
  tickerId: string;
  exchangeId: string;
  market: Market;
  date: string;
  /** 軸の値・点灯状態（予測時点） */
  axisValues: Partial<Record<AxisId, number | boolean>>;
  /** 算出に使った平常 */
  normal: { range?: number; volume?: number };
}

/** 市場×日の軸の値 */
export interface MarketAxisValues {
  market: Market;
  date: string;
  axisValues: Partial<Record<AxisId, number>>;
}

/** 銘柄×日の算出結果（Forecast アイテムの予測部分に対応） */
export interface TickerForecastResult extends TickerAxisValues {
  probabilities: Partial<Record<'DIR' | 'VOL', ProbabilityRecord>>;
}

/** 市場×日の算出結果（MarketForecast アイテムの予測部分に対応） */
export interface MarketForecastResult extends MarketAxisValues {
  probabilities: Partial<Record<'MKT', ProbabilityRecord>>;
}

/** computeForDate の戻り値 */
export interface ComputeForDateResult {
  date: string;
  market: Market;
  tickers: TickerForecastResult[];
  /** その市場・日の観測が 1 件も無ければ undefined（design.md §1「D の足が無いときは空」） */
  marketForecast: MarketForecastResult | undefined;
  modelSnapshots: Partial<Record<Question, ModelSnapshotItem>>;
  /** 未対応の ExchangeID を持つバー（NFR-2。処理は継続しつつ、この一覧で呼び出し側がログできる） */
  skippedExchangeIds: string[];
}

/**
 * computeAxisValuesForDate / computeOutcomes への入力の 1 行（DailySummary 相当）。
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
  /**
   * 翌営業日の値幅（(翌営業日高値 − 翌営業日安値) ÷ 基準日終値。design.md §1.1 の値幅の定義と揃える。
   * 生の価格差ではなく比率）。除外時も参考値として持つ。
   */
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
  /** 翌営業日の市場平均値幅（有効銘柄の値幅比率の平均。既に比率であり生値ではない） */
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

/**
 * 銘柄×日のサンプル（design.md §3.1「保存済み Forecast」相当）。
 *
 * 学習・基準値・中立帯・確率帯の実績・AxisStats は、生の DailySummary からではなく、
 * この形（= 実際に DynamoDB へ保存される Forecast アイテムの写し）から計算する。
 * 時刻の規則（`isSampleUsable`）は `outcome.nextDate` と `market` から直接判定し、
 * 観測カレンダーには依存しない。
 */
export interface TickerSample {
  tickerId: string;
  exchangeId: string;
  market: Market;
  date: string;
  axisValues: Partial<Record<AxisId, number | boolean>>;
  normal?: { range?: number; volume?: number };
  /** 採点済みのときだけ存在する（Forecast.Outcome 相当） */
  outcome?: {
    nextDate: string;
    hit: Partial<Record<'DIR' | 'VOL', boolean>>;
    /** DIR の AxisStats.meanExcessReturn 用 */
    excessReturn?: number;
    excludedReason?: 'EXTREME_RETURN';
  };
  /** その日に確率を出していれば存在する（Forecast.Probabilities 相当。中立帯の判定に使う） */
  probabilities?: Partial<Record<'DIR' | 'VOL', { probability: number; baseline: number }>>;
}

/** 市場×日のサンプル（design.md §3.1「保存済み MarketForecast」相当） */
export interface MarketSample {
  market: Market;
  date: string;
  axisValues: Partial<Record<AxisId, number>>;
  outcome?: {
    nextDate: string;
    hit: Partial<Record<'MKT', boolean>>;
  };
  probabilities?: Partial<Record<'MKT', { probability: number; baseline: number }>>;
}

/**
 * 保存済みサンプルの履歴（design.md §3.1）。学習・基準値・中立帯・AxisStats の入力。
 * DailyBarInput（生の DailySummary）は含まない。
 */
export interface SampleHistory {
  tickerSamples: readonly TickerSample[];
  marketSamples: readonly MarketSample[];
}
