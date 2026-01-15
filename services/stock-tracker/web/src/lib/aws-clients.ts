/**
 * AWS Clients シングルトン
 *
 * DynamoDB クライアントのシングルトンインスタンスを提供
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// DynamoDB クライアントのシングルトンインスタンス
let dynamoDBClient: DynamoDBClient | null = null;
let docClient: DynamoDBDocumentClient | null = null;

/**
 * DynamoDB Document Client のシングルトンインスタンスを取得
 *
 * @returns DynamoDB Document Client
 */
export function getDynamoDBDocumentClient(): DynamoDBDocumentClient {
  if (!docClient) {
    dynamoDBClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });
  }

  return docClient;
}

/**
 * DynamoDB テーブル名を取得
 *
 * @returns テーブル名
 */
export function getTableName(): string {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error('環境変数 DYNAMODB_TABLE_NAME が設定されていません');
  }
  return tableName;
}
