/**
 * セーフティ機能の DI ファクトリ（Web 層 / Phase 2d / Issue #3250）。
 *
 * - 本番 / dev: OpenAI Moderation API クライアント + DynamoDB SafetyEventRepository
 * - テスト・ローカル: NoOpModerationClient + InMemorySafetyEventRepository
 */

import { InMemorySingleTableStore, registerDynamoRepositories } from '@nagiyu/aws';
import type { SafetyEventRepository } from '@nagiyu/livetalk-core';
import {
  DynamoDBSafetyEventRepository,
  InMemorySafetyEventRepository,
  NoOpModerationClient,
  OpenAIModerationClient,
  type IModerationClient,
} from '@nagiyu/livetalk-core';

const registry = registerDynamoRepositories<
  { safetyEvent: SafetyEventRepository },
  InMemorySingleTableStore
>(
  {
    safetyEvent: {
      createInMemoryRepository: (store) => new InMemorySafetyEventRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBSafetyEventRepository(docClient, tableName),
    },
  },
  {
    keyPrefix: 'livetalk',
    createSharedStore: () => new InMemorySingleTableStore(),
  }
);

export function getSafetyEventRepository(): SafetyEventRepository {
  return registry.safetyEvent.createRepository();
}

let _moderationClient: IModerationClient | null = null;

export function getModerationClient(): IModerationClient {
  if (_moderationClient) return _moderationClient;

  const useInMemory = process.env.USE_IN_MEMORY_DB === 'true';
  if (useInMemory) {
    _moderationClient = new NoOpModerationClient();
    return _moderationClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // キー未設定時は no-op（開発環境でのフォールバック）
    _moderationClient = new NoOpModerationClient();
    return _moderationClient;
  }

  _moderationClient = new OpenAIModerationClient({ apiKey });
  return _moderationClient;
}

/** テスト用：モジュールレベルのキャッシュをリセットする */
export function resetSafetyForTesting(): void {
  registry.resetAll();
  _moderationClient = null;
}
