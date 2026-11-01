/**
 * セーフティ機能のうち、環境で実装が切り替わるモデレーションクライアントの生成口。
 *
 * - 本番 / dev: OpenAI Moderation API クライアント
 * - テスト・ローカル: NoOpModerationClient
 *
 * SafetyEvent のリポジトリは、ほかのリポジトリと共有の InMemory ストアを使うため、
 * ここでは持たず `@nagiyu/livetalk-core` の `createSafetyEventRepository` から得る。
 */

import {
  NoOpModerationClient,
  OpenAIModerationClient,
  type IModerationClient,
} from '@nagiyu/livetalk-core';

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

/**
 * テスト用：モデレーションクライアントのキャッシュをリセットする。
 * リポジトリのリセットは core の `resetRepositoryFactories` が担う。
 */
export function resetSafetyForTesting(): void {
  _moderationClient = null;
}
