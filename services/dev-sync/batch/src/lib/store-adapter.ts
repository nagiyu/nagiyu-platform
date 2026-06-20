/**
 * dev-sync バッチ DynamoDB ストアアダプター
 *
 * テスト時は InMemorySingleTableStore、本番時は DynamoDBDocumentClient を使う。
 * コアロジックはこのインターフェース経由で操作するため、副作用を分離できる。
 */

import type { DynamoDBItem } from '@nagiyu/aws';

/**
 * スキャン結果のページ
 */
export interface ScanPage {
  items: DynamoDBItem[];
  /** 次のページが存在する場合の継続トークン（Base64 文字列） */
  lastEvaluatedKey?: string;
}

/**
 * クエリ結果のページ
 */
export interface QueryPage {
  items: DynamoDBItem[];
  /** 次のページが存在する場合の継続トークン（Base64 文字列） */
  lastEvaluatedKey?: string;
}

/**
 * dev-sync が必要とする DynamoDB テーブル操作のインターフェース
 */
export interface DynamoTableStore {
  /**
   * テーブルを全件スキャンする（1 ページ分）
   *
   * @param pkPrefix - PK プレフィックスでフィルタする場合に指定（FilterExpression）
   * @param skPrefix - SK プレフィックスでフィルタする場合に指定（FilterExpression）
   * @param exclusiveStartKey - ページネーション用の開始キー
   */
  scan(options: {
    pkPrefix?: string;
    skPrefix?: string;
    exclusiveStartKey?: string;
  }): Promise<ScanPage>;

  /**
   * GSI をクエリする（1 ページ分）
   *
   * @param indexName - GSI 名
   * @param pkAttributeName - パーティションキー属性名
   * @param pkValue - パーティションキー値
   * @param skAttributeName - ソートキー属性名
   * @param skFrom - ソートキーの下限（begins_with ではなく範囲クエリで対応）
   * @param exclusiveStartKey - ページネーション用の開始キー
   */
  queryGsi(options: {
    indexName: string;
    pkAttributeName: string;
    pkValue: string;
    skAttributeName: string;
    skFrom: string;
    exclusiveStartKey?: string;
  }): Promise<QueryPage>;

  /**
   * アイテムを upsert する
   *
   * @param item - 保存する DynamoDB アイテム
   */
  put(item: DynamoDBItem): Promise<void>;

  /**
   * アイテムを削除する
   *
   * @param pk - パーティションキー
   * @param sk - ソートキー
   */
  delete(pk: string, sk: string): Promise<void>;
}
