import { S3Client } from '@aws-sdk/client-s3';
import {
  clearBatchClientCache,
  clearDynamoDBClientCache,
  createS3Client,
  getBatchClient,
  getDynamoDBDocumentClient,
} from '@nagiyu/aws';

// AWS クライアントのシングルトン
let cachedS3Client: S3Client | null = null;

/**
 * AWS クライアントのキャッシュをクリア（主にテスト用）
 */
export function clearAwsClientsCache(): void {
  clearBatchClientCache();
  clearDynamoDBClientCache();
  cachedS3Client = null;
}

/**
 * AWS クライアントを取得（シングルトンパターン）
 */
export function getAwsClients() {
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  const docClient = getDynamoDBDocumentClient(AWS_REGION);

  if (!cachedS3Client) {
    cachedS3Client = createS3Client({ region: AWS_REGION });
  }

  return {
    docClient,
    s3Client: cachedS3Client,
    batchClient: getBatchClient(AWS_REGION),
  };
}
