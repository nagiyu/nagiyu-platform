import {
  clearBatchClientCache,
  clearDynamoDBClientCache,
  getBatchClient,
  getDynamoDBDocumentClient,
} from '@nagiyu/aws';

/**
 * AWS クライアントのキャッシュをクリア（主にテスト用）
 */
export function clearAwsClientsCache(): void {
  clearDynamoDBClientCache();
  clearBatchClientCache();
}

/**
 * AWS クライアントを取得（シングルトンパターン）
 */
export function getAwsClients() {
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  const docClient = getDynamoDBDocumentClient(AWS_REGION);

  return {
    docClient,
    batchClient: getBatchClient(AWS_REGION),
  };
}
