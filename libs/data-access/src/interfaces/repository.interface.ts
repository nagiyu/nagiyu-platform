/**
 * リポジトリ設定インターフェース
 */
export interface RepositoryConfig {
  /** DynamoDBテーブル名 */
  tableName: string;
  /** エンティティタイプ（Type フィールドの値） */
  entityType: string;
}
