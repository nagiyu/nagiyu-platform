import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BatchClient } from '@aws-sdk/client-batch';

// AWS クライアントのシングルトン
let cachedDocClient: DynamoDBDocumentClient | null = null;
let cachedBatchClient: BatchClient | null = null;

/**
 * AWS クライアントのキャッシュをクリア（主にテスト用）
 */
export function clearAwsClientsCache(): void {
  cachedDocClient = null;
  cachedBatchClient = null;
}

/**
 * AWS クライアントを取得（シングルトンパターン）
 */
export function getAwsClients() {
  if (!cachedDocClient || !cachedBatchClient) {
    const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
    const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    cachedDocClient = DynamoDBDocumentClient.from(dynamoClient);
    cachedBatchClient = new BatchClient({ region: AWS_REGION });
  }

  return {
    docClient: cachedDocClient,
    batchClient: cachedBatchClient,
  };
}
