/**
 * DynamoDB Repository 型定義
 *
 * DynamoDBリポジトリで使用する共通の型定義を提供
 */

/**
 * DynamoDB Single Table Design の基本Item構造
 */
export interface DynamoDBItem extends Record<string, unknown> {
  /** パーティションキー - エンティティごとに異なる形式 */
  PK: string;
  /** ソートキー - エンティティごとに異なる形式 */
  SK: string;
  /** エンティティタイプ - データの種類を識別 */
  Type: string;
  /** GSI1 パーティションキー (オプション) */
  GSI1PK?: string;
  /** GSI1 ソートキー (オプション) */
  GSI1SK?: string;
  /** GSI2 パーティションキー (オプション) */
  GSI2PK?: string;
  /** GSI2 ソートキー (オプション) */
  GSI2SK?: string;
  /** GSI3 パーティションキー (オプション) */
  GSI3PK?: string;
  /** GSI3 ソートキー (オプション) */
  GSI3SK?: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) */
  UpdatedAt: number;
}

/**
 * ページネーションオプション
 */
export interface PaginationOptions {
  /** 取得する最大件数 */
  limit?: number;
  /** 次のページのカーソル（不透明トークン） */
  cursor?: string;
}

/**
 * ページネーション結果
 */
export interface PaginatedResult<T> {
  /** データの配列 */
  items: T[];
  /** 次のページがある場合のカーソル */
  nextCursor?: string;
  /** 総件数（取得可能な場合） */
  count?: number;
}

/**
 * リポジトリ設定
 */
export interface RepositoryConfig {
  /** DynamoDBテーブル名 */
  tableName: string;
  /** エンティティタイプ（Type フィールドの値） */
  entityType: string;
}
