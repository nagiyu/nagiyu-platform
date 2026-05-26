import { createLLMClient } from '@nagiyu/livetalk-core';
import type { ILLMClient } from '@nagiyu/livetalk-core';

/**
 * LLM クライアントのシングルトン。
 * OPENAI_API_KEY は ECS タスク起動時に Secrets Manager から注入される。
 */
let cachedClient: ILLMClient | null = null;

export function getLLMClient(): ILLMClient {
  if (!cachedClient) {
    cachedClient = createLLMClient();
  }
  return cachedClient;
}

export function setLLMClientForTesting(client: ILLMClient | null): void {
  cachedClient = client;
}
