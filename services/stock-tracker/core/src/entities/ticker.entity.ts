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
  /** ティッカーID。`{Exchange.key}:{symbol}` 形式で自動生成 (例: NSDQ:AAPL)、作成後変更不可 */
  tickerId: string;
  /** シンボル。1-20文字、英大文字と数字のみ */
  symbol: string;
  /** 銘柄名。1-200文字 */
  name: string;
  /** 取引所ID。作成後変更不可 */
  exchangeId: string;
  /** 作成日時 (Unix timestamp ミリ秒) */
  createdAt: number;
  /** 更新日時 (Unix timestamp ミリ秒) */
  updatedAt: number;
}

/**
 * Ticker作成時の入力データ（createdAt/updatedAtを含まない）
 */
export type CreateTickerInput = Omit<TickerEntity, 'createdAt' | 'updatedAt'>;

/**
 * Ticker更新時の入力データ（更新可能なフィールドのみ）
 */
export type UpdateTickerInput = Partial<Pick<TickerEntity, 'symbol' | 'name'>>;

/**
 * Tickerのビジネスキー
 */
export interface TickerKey {
  tickerId: string;
}
