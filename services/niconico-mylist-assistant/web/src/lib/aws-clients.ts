import { BatchClient } from '@aws-sdk/client-batch';
import { clearDynamoDBClientCache, getDynamoDBDocumentClient } from '@nagiyu/aws';

// AWS クライアントのシングルトン
let cachedBatchClient: BatchClient | null = null;

/**
 * AWS クライアントのキャッシュをクリア（主にテスト用）
 */
export function clearAwsClientsCache(): void {
  clearDynamoDBClientCache();
  cachedBatchClient = null;
}

/**
 * AWS クライアントを取得（シングルトンパターン）
 */
export function getAwsClients() {
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  const docClient = getDynamoDBDocumentClient(AWS_REGION);

  if (!cachedBatchClient) {
    cachedBatchClient = new BatchClient({ region: AWS_REGION });
  }

  return {
    docClient,
    batchClient: cachedBatchClient,
  };
}
