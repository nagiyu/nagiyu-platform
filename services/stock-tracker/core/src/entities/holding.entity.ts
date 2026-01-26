/**
 * Stock Tracker Core - Holding Entity
 *
 * 保有株式のビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

/**
 * 保有株式エンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 */
export interface HoldingEntity {
  /** ユーザーID */
  UserID: string;
  /** ティッカーID */
  TickerID: string;
  /** 取引所ID */
  ExchangeID: string;
  /** 保有数 */
  Quantity: number;
  /** 平均取得価格 */
  AveragePrice: number;
  /** 通貨コード */
  Currency: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) */
  UpdatedAt: number;
}

/**
 * Holding作成時の入力データ（CreatedAt/UpdatedAtを含まない）
 */
export type CreateHoldingInput = Omit<HoldingEntity, 'CreatedAt' | 'UpdatedAt'>;

/**
 * Holding更新時の入力データ（更新可能なフィールドのみ）
 */
export type UpdateHoldingInput = Partial<
  Pick<HoldingEntity, 'Quantity' | 'AveragePrice' | 'Currency'>
>;

/**
 * HoldingのビジネスキーTEntity
 */
export interface HoldingKey {
  userId: string;
  tickerId: string;
}
