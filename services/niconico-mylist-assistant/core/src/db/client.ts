import { getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function getDocClient(): DynamoDBDocumentClient {
  return getDynamoDBDocumentClient();
}

/** @nagiyu/aws の getTableName を再エクスポート。環境変数 DYNAMODB_TABLE_NAME から DynamoDB テーブル名を取得する */
export { getTableName };
