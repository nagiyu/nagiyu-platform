import type { DynamoDBItem } from '../types.js';

/**
 * Entity ↔ DynamoDB Item の変換を担当するMapper
 *
 * @template TEntity - ビジネスオブジェクト（PK/SKを持たない）
 * @template TKey - エンティティを一意に識別するキー
 * @deprecated キーが `{ pk, sk }` 固定で単一キーのテーブルを表せないため、`EntityMapper` を使う
 */
export interface LegacyEntityMapper<TEntity, TKey> {
  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - ビジネスオブジェクト
   * @returns DynamoDB Item
   */
  toItem(entity: TEntity): DynamoDBItem;

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns ビジネスオブジェクト
   */
  toEntity(item: DynamoDBItem): TEntity;

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - エンティティを一意に識別するキー
   * @returns PK と SK
   */
  buildKeys(key: TKey): { pk: string; sk: string };
}
