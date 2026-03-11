import { S3Client } from '@aws-sdk/client-s3';
import { BatchClient } from '@aws-sdk/client-batch';
import { clearDynamoDBClientCache, getDynamoDBDocumentClient } from '@nagiyu/aws';

// AWS クライアントのシングルトン
let cachedS3Client: S3Client | null = null;
let cachedBatchClient: BatchClient | null = null;

/**
 * AWS クライアントのキャッシュをクリア（主にテスト用）
 */
export function clearAwsClientsCache(): void {
  clearDynamoDBClientCache();
  cachedS3Client = null;
  cachedBatchClient = null;
}

/**
 * AWS クライアントを取得（シングルトンパターン）
 */
export function getAwsClients() {
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  const docClient = getDynamoDBDocumentClient(AWS_REGION);

  if (!cachedS3Client || !cachedBatchClient) {
    cachedS3Client = new S3Client({ region: AWS_REGION });
    cachedBatchClient = new BatchClient({ region: AWS_REGION });
  }

  return {
    docClient,
    s3Client: cachedS3Client,
    batchClient: cachedBatchClient,
  };
}
