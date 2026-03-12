import { BatchClient } from '@aws-sdk/client-batch';

const DEFAULT_REGION = 'us-east-1';
const cachedClients = new Map<string, BatchClient>();

/**
 * Batch クライアントのキャッシュをクリアする（主にテスト用）。
 */
export function clearBatchClientCache(): void {
  cachedClients.clear();
}

/**
 * Batch クライアントを取得する。
 * 同一リージョンのクライアントはキャッシュを再利用し、未指定時は `AWS_REGION`、
 * さらに未設定の場合は `us-east-1` を使用する。
 */
export function getBatchClient(region?: string): BatchClient {
  const targetRegion = region || process.env.AWS_REGION || DEFAULT_REGION;
  const cachedClient = cachedClients.get(targetRegion);

  if (cachedClient) {
    return cachedClient;
  }

  const client = new BatchClient({ region: targetRegion });
  cachedClients.set(targetRegion, client);

  return client;
}
