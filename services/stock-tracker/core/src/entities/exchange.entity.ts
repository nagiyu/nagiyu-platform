/**
 * Stock Tracker Core - Exchange Entity
 *
 * 取引所のビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

/**
 * 現在価格の取得元データソース
 *
 * - tradingview: TradingView API（デフォルト、東証など全市場対応）
 * - finnhub: Finnhub API（米国株専用: NASDAQ/NYSE/AMEX）
 */
export type PriceSource = 'tradingview' | 'finnhub';

/** 有効なデータソース一覧 */
export const PRICE_SOURCES: readonly PriceSource[] = ['tradingview', 'finnhub'];

/** データソースのデフォルト値 */
export const DEFAULT_PRICE_SOURCE: PriceSource = 'tradingview';

/**
 * 取引所エンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 */
export interface ExchangeEntity {
  /** 取引所ID */
  ExchangeID: string;
  /** 取引所名 */
  Name: string;
  /** TradingView API用キー */
  Key: string;
  /** タイムゾーン (IANA形式) */
  Timezone: string;
  /** 取引開始時刻 (HH:MM形式) */
  Start: string;
  /** 取引終了時刻 (HH:MM形式) */
  End: string;
  /**
   * 現在価格の取得元。既定 tradingview
   *
   * - tradingview: TradingView API（東証など全市場対応）
   * - finnhub: Finnhub API（米国株専用: NASDAQ/NYSE/AMEX）
   */
  PriceSource: PriceSource;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) */
  UpdatedAt: number;
}

/**
 * Exchange作成時の入力データ（CreatedAt/UpdatedAtを含まない）
 */
export type CreateExchangeInput = Omit<ExchangeEntity, 'CreatedAt' | 'UpdatedAt'>;

/**
 * Exchange更新時の入力データ（更新可能なフィールドのみ）
 */
export type UpdateExchangeInput = Partial<
  Pick<ExchangeEntity, 'Name' | 'Timezone' | 'Start' | 'End' | 'PriceSource'>
>;

/**
 * Exchangeのビジネスキー
 */
export interface ExchangeKey {
  exchangeId: string;
}
