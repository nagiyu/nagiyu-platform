/**
 * Stock Tracker Core - Ticker Entity
 *
 * ティッカー（銘柄）のビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

/**
 * ティッカーエンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 */
export interface TickerEntity {
  /** ティッカーID */
  TickerID: string;
  /** シンボル */
  Symbol: string;
  /** 銘柄名 */
  Name: string;
  /** 取引所ID */
  ExchangeID: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) */
  UpdatedAt: number;
}

/**
 * Ticker作成時の入力データ（CreatedAt/UpdatedAtを含まない）
 */
export type CreateTickerInput = Omit<TickerEntity, 'CreatedAt' | 'UpdatedAt'>;

/**
 * Ticker更新時の入力データ（更新可能なフィールドのみ）
 */
export type UpdateTickerInput = Partial<Pick<TickerEntity, 'Symbol' | 'Name'>>;

/**
 * Tickerのビジネスキー
 */
export interface TickerKey {
  tickerId: string;
}
