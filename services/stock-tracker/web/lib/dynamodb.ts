/**
 * DynamoDB Client Utility
 *
 * シングルトンパターンでDynamoDBクライアントを提供
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// AWS クライアントのシングルトン
let cachedDocClient: DynamoDBDocumentClient | null = null;

/**
 * DynamoDB Document Client を取得（シングルトンパターン）
 *
 * @returns DynamoDBDocumentClient インスタンス
 */
export function getDynamoDBClient(): DynamoDBDocumentClient {
  if (!cachedDocClient) {
    const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
    const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    cachedDocClient = DynamoDBDocumentClient.from(dynamoClient);
  }

  return cachedDocClient;
}

/**
 * DynamoDB テーブル名を取得
 *
 * @returns DynamoDB テーブル名
 * @throws テーブル名が設定されていない場合
 */
export function getTableName(): string {
  const tableName = process.env.DYNAMODB_TABLE_NAME;

  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME environment variable is not set');
  }

  return tableName;
}
