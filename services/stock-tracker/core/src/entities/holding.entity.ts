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
  /** ユーザーID。作成後変更不可 */
  userId: string;
  /** ティッカーID。作成後変更不可 */
  tickerId: string;
  /** 取引所ID。作成後変更不可 */
  exchangeId: string;
  /** 保有数。0.0001〜1,000,000,000 */
  quantity: number;
  /** 平均取得価格。0.01〜1,000,000 */
  averagePrice: number;
  /** 通貨コード (例: USD, JPY) */
  currency: string;
  /** 作成日時 (Unix timestamp ミリ秒) */
  createdAt: number;
  /** 更新日時 (Unix timestamp ミリ秒) */
  updatedAt: number;
}

/**
 * Holding作成時の入力データ（createdAt/updatedAtを含まない）
 */
export type CreateHoldingInput = Omit<HoldingEntity, 'createdAt' | 'updatedAt'>;

/**
 * Holding更新時の入力データ（更新可能なフィールドのみ）
 */
export type UpdateHoldingInput = Partial<
  Pick<HoldingEntity, 'quantity' | 'averagePrice' | 'currency'>
>;

/**
 * Holdingのビジネスキー
 */
export interface HoldingKey {
  userId: string;
  tickerId: string;
}
