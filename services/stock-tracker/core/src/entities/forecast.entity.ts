/**
 * Stock Tracker Core - Forecast Entity
 *
 * 確度（銘柄×日）のビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）。
 * 画面に出した値を後から検証できるよう、予測部分 (axisValues〜backfilledAxes) は
 * 一度書いたら書き換えない。outcome は採点バッチが後から追記する別属性として持つ。
 */
import type { AxisId, Market, ProbabilityRecord, TickerOutcome } from '../forecast/index.js';

/** 算出に使った平常 */
export interface ForecastNormal {
  range?: number;
  volume?: number;
}

/**
 * 採点結果（採点バッチが後から追記する）。
 *
 * 銘柄・基準日は親アイテム (tickerId/date) と重複するため持たない
 * （`TickerOutcome` から識別子フィールドを除いた形）。
 */
export type ForecastOutcome = Omit<TickerOutcome, 'tickerId' | 'exchangeId' | 'market' | 'date'>;

/**
 * Forecast エンティティ
 *
 * DynamoDBの実装詳細（PK/SK/GSI）を含まない純粋なビジネスオブジェクト
 */
export interface ForecastEntity {
  /** ティッカーID */
  tickerId: string;
  /** 取引所ID */
  exchangeId: string;
  /** 市場 */
  market: Market;
  /** 基準日 (YYYY-MM-DD) */
  date: string;
  /** 軸の値・点灯状態（予測時点） */
  axisValues: Partial<Record<AxisId, number | boolean>>;
  /** 算出に使った平常 */
  normal: ForecastNormal;
  /** 問いごとの確度（予測時点の値。書き換えない） */
  probabilities: Partial<Record<'DIR' | 'VOL', ProbabilityRecord>>;
  /** 算出ロジックの版 */
  modelVersion: string;
  /** 初期値算出で作ったか、稼働後に作ったか */
  source: 'REPLAY' | 'LIVE';
  /** 初期値算出で後から追記した軸と追記日（予測時点の値ではない） */
  backfilledAxes?: Partial<Record<AxisId, string>>;
  /** 採点結果（採点バッチが翌営業日の到着後に追記する） */
  outcome?: ForecastOutcome;
  /** 作成日時 (Unix timestamp ms) */
  createdAt: number;
  /** 更新日時 (Unix timestamp ms) */
  updatedAt: number;
}

/**
 * Forecast 作成時の入力データ (outcome・createdAt・updatedAt を含まない。
 * outcome は必ず `appendOutcome` で後から追記するため、作成時には持てない)
 */
export type CreateForecastInput = Omit<ForecastEntity, 'outcome' | 'createdAt' | 'updatedAt'>;

/**
 * Forecast のビジネスキー
 */
export interface ForecastKey {
  tickerId: string;
  date: string;
}
