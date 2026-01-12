import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { BatchClient } from '@aws-sdk/client-batch';

// AWS クライアントのシングルトン
let cachedDocClient: DynamoDBDocumentClient | null = null;
let cachedS3Client: S3Client | null = null;
let cachedBatchClient: BatchClient | null = null;

/**
 * AWS クライアントのキャッシュをクリア（主にテスト用）
 */
export function clearAwsClientsCache(): void {
  cachedDocClient = null;
  cachedS3Client = null;
  cachedBatchClient = null;
}

/**
 * AWS クライアントを取得（シングルトンパターン）
 */
export function getAwsClients() {
  if (!cachedDocClient || !cachedS3Client || !cachedBatchClient) {
    const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
    const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    cachedDocClient = DynamoDBDocumentClient.from(dynamoClient);
    cachedS3Client = new S3Client({ region: AWS_REGION });
    cachedBatchClient = new BatchClient({ region: AWS_REGION });
  }

  return {
    docClient: cachedDocClient,
    s3Client: cachedS3Client,
    batchClient: cachedBatchClient,
  };
}
