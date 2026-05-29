import { LambdaClient } from '@aws-sdk/client-lambda';

const DEFAULT_REGION = 'us-east-1';
const cachedClients = new Map<string, LambdaClient>();

export function clearLambdaClientCache(): void {
  cachedClients.clear();
}

/**
 * Lambda クライアントを取得する。
 * 同一リージョンのクライアントはキャッシュを再利用し、未指定時は `AWS_REGION`、
 * さらに未設定の場合は `us-east-1` を使用する。
 */
export function getLambdaClient(region?: string): LambdaClient {
  const targetRegion = region || process.env.AWS_REGION || DEFAULT_REGION;
  const cachedClient = cachedClients.get(targetRegion);

  if (cachedClient) {
    return cachedClient;
  }

  const client = new LambdaClient({ region: targetRegion });
  cachedClients.set(targetRegion, client);

  return client;
}
