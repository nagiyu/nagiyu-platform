/**
 * AWS クライアントのシングルトン
 * DynamoDB クライアントを再利用してパフォーマンスを向上させる
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Document Client のシングルトンインスタンス
 */
let docClient: DynamoDBDocumentClient | null = null;

/**
 * DynamoDB Document Client を取得する
 * シングルトンパターンで再利用可能なクライアントを返す
 *
 * @returns DynamoDB Document Client
 */
export function getDynamoDBDocumentClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'ap-northeast-1',
    });

    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  return docClient;
}

/**
 * DynamoDB テーブル名を取得する
 * 環境変数から取得し、未設定の場合はエラーをスローする
 *
 * @returns DynamoDB テーブル名
 * @throws {Error} 環境変数が未設定の場合
 */
export function getTableName(): string {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error('環境変数 DYNAMODB_TABLE_NAME が設定されていません');
  }
  return tableName;
}
