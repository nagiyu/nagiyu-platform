/**
 * Stock Tracker Core - MarketForecast Entity
 *
 * 確度（市場×日）のビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）。
 * Forecast（銘柄×日）と同じ性質を持つ（予測部分は一度書いたら書き換えず、
 * outcome は採点バッチが後から追記する)。
 */
import type { AxisId, Market, MarketOutcome, ProbabilityRecord } from '../forecast/index.js';

/**
 * 採点結果（採点バッチが後から追記する）。
 *
 * 市場・基準日は親アイテム (market/date) と重複するため持たない
 * （`MarketOutcome` から識別子フィールドを除いた形）。
 */
export type MarketForecastOutcome = Omit<MarketOutcome, 'market' | 'date'>;

/**
 * MarketForecast エンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 */
export interface MarketForecastEntity {
  /** 市場 */
  market: Market;
  /** 基準日 (YYYY-MM-DD) */
  date: string;
  /** 市場レベル軸の値（予測時点） */
  axisValues: Partial<Record<AxisId, number>>;
  /** Q-MKT の確度（予測時点の値。書き換えない） */
  probabilities: Partial<Record<'MKT', ProbabilityRecord>>;
  /** 算出ロジックの版 */
  modelVersion: string;
  /** 初期値算出で作ったか、稼働後に作ったか */
  source: 'REPLAY' | 'LIVE';
  /** 初期値算出で後から追記した軸と追記日（予測時点の値ではない） */
  backfilledAxes?: Partial<Record<AxisId, string>>;
  /** 採点結果（採点バッチが翌営業日の到着後に追記する） */
  outcome?: MarketForecastOutcome;
  /** 作成日時 (Unix timestamp ms) */
  createdAt: number;
  /** 更新日時 (Unix timestamp ms) */
  updatedAt: number;
}

/**
 * MarketForecast 作成時の入力データ (outcome・createdAt・updatedAt を含まない)
 */
export type CreateMarketForecastInput = Omit<
  MarketForecastEntity,
  'outcome' | 'createdAt' | 'updatedAt'
>;

/**
 * MarketForecast のビジネスキー
 */
export interface MarketForecastKey {
  market: Market;
  date: string;
}
