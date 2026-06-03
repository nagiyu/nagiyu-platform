import { createEmbeddingClient } from '@nagiyu/livetalk-core';
import type { IEmbeddingClient } from '@nagiyu/livetalk-core';

let cachedClient: IEmbeddingClient | null = null;

export function getEmbeddingClient(): IEmbeddingClient {
  if (!cachedClient) {
    cachedClient = createEmbeddingClient();
  }
  return cachedClient;
}

export function setEmbeddingClientForTesting(client: IEmbeddingClient | null): void {
  cachedClient = client;
}
