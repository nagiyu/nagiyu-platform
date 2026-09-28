/**
 * Stock Tracker Core - MarketForecast Entity
 *
 * 確度（市場×日）のビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）。
 * Forecast と同じ性質を持つ（design.md §2.3「MarketForecast も同じ形」）。
 */
import type { AxisId, Market, MarketOutcome, ProbabilityRecord } from '../forecast/index.js';

/**
 * MarketForecast.Outcome（design.md §2.3）。
 *
 * 市場・基準日は親アイテム（Market/Date）と重複するため持たない
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
  Market: Market;
  /** 基準日 (YYYY-MM-DD) */
  Date: string;
  /** 市場レベル軸の値（予測時点） */
  AxisValues: Partial<Record<AxisId, number>>;
  /** Q-MKT の確度（予測時点の値。書き換えない） */
  Probabilities: Partial<Record<'MKT', ProbabilityRecord>>;
  /** 算出ロジックの版 */
  ModelVersion: string;
  /** 初期値算出で作ったか、稼働後に作ったか */
  Source: 'REPLAY' | 'LIVE';
  /** 初期値算出で後から追記した軸と追記日（予測時点の値ではない） */
  BackfilledAxes?: Partial<Record<AxisId, string>>;
  /** 採点結果（採点バッチが翌営業日の到着後に追記する） */
  Outcome?: MarketForecastOutcome;
  /** 作成日時 (Unix timestamp ms) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp ms) */
  UpdatedAt: number;
}

/**
 * MarketForecast 作成時の入力データ（Outcome・CreatedAt・UpdatedAt を含まない）
 */
export type CreateMarketForecastInput = Omit<
  MarketForecastEntity,
  'Outcome' | 'CreatedAt' | 'UpdatedAt'
>;

/**
 * MarketForecast のビジネスキー
 */
export interface MarketForecastKey {
  market: Market;
  date: string;
}
