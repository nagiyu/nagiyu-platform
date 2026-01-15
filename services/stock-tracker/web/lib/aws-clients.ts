import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// AWS クライアントのシングルトン
let cachedDocClient: DynamoDBDocumentClient | null = null;

/**
 * AWS クライアントのキャッシュをクリア（主にテスト用）
 */
export function clearAwsClientsCache(): void {
  cachedDocClient = null;
}

/**
 * DynamoDB Document Client を取得（シングルトンパターン）
 */
export function getDynamoDBDocClient(): DynamoDBDocumentClient {
  if (!cachedDocClient) {
    const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
    const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    cachedDocClient = DynamoDBDocumentClient.from(dynamoClient);
  }

  return cachedDocClient;
}

/**
 * DynamoDB テーブル名を取得
 */
export function getDynamoDBTableName(): string {
  const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  return process.env.DYNAMODB_TABLE_NAME || `nagiyu-stock-tracker-main-${env}`;
}
