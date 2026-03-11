import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { BatchClient } from '@aws-sdk/client-batch';
import { clearDynamoDBClientCache, getDynamoDBDocumentClient } from '@nagiyu/aws';

// AWS クライアントのシングルトン
let cachedDocClient: DynamoDBDocumentClient | null = null;
let cachedS3Client: S3Client | null = null;
let cachedBatchClient: BatchClient | null = null;

/**
 * AWS クライアントのキャッシュをクリア（主にテスト用）
 */
export function clearAwsClientsCache(): void {
  clearDynamoDBClientCache();
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
    cachedDocClient = getDynamoDBDocumentClient(AWS_REGION);
    cachedS3Client = new S3Client({ region: AWS_REGION });
    cachedBatchClient = new BatchClient({ region: AWS_REGION });
  }

  return {
    docClient: cachedDocClient,
    s3Client: cachedS3Client,
    batchClient: cachedBatchClient,
  };
}
