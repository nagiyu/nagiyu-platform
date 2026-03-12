import { BatchClient } from '@aws-sdk/client-batch';

const DEFAULT_REGION = 'us-east-1';
const cachedClients = new Map<string, BatchClient>();

export function clearBatchClientCache(): void {
  cachedClients.clear();
}

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
