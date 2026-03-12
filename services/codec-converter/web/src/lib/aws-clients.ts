import {
  clearBatchClientCache,
  clearDynamoDBClientCache,
  clearS3ClientCache,
  getBatchClient,
  getDynamoDBDocumentClient,
  getS3Client,
} from '@nagiyu/aws';

/**
 * AWS クライアントのキャッシュをクリア（主にテスト用）
 */
export function clearAwsClientsCache(): void {
  clearBatchClientCache();
  clearDynamoDBClientCache();
  clearS3ClientCache();
}

/**
 * AWS クライアントを取得（シングルトンパターン）
 */
export function getAwsClients() {
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  const docClient = getDynamoDBDocumentClient(AWS_REGION);

  return {
    docClient,
    s3Client: getS3Client(AWS_REGION),
    batchClient: getBatchClient(AWS_REGION),
  };
}
