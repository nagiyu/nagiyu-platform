/**
 * Stock Tracker Core - Watchlist Entity
 *
 * ウォッチリストのビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

/**
 * ウォッチリストエンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 *
 * Note: Watchlist は UpdatedAt フィールドを持たない（読み取り専用のため）
 */
export interface WatchlistEntity {
  /** ユーザーID */
  UserID: string;
  /** ティッカーID */
  TickerID: string;
  /** 取引所ID */
  ExchangeID: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
}

/**
 * Watchlist作成時の入力データ（CreatedAtを含まない）
 */
export type CreateWatchlistInput = Omit<WatchlistEntity, 'CreatedAt'>;

/**
 * Watchlistのビジネスキー
 */
export interface WatchlistKey {
  userId: string;
  tickerId: string;
}
