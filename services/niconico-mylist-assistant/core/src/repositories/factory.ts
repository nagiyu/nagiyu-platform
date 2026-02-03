/**
 * NiconicoMylistAssistant Core - Repository Factory
 *
 * Repository の生成を環境変数によって切り替える Factory パターン実装
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { VideoRepository } from './video.repository.interface';
import type { UserSettingRepository } from './user-setting.repository.interface';
import { DynamoDBVideoRepository } from './dynamodb-video.repository';
import { DynamoDBUserSettingRepository } from './dynamodb-user-setting.repository';
import { InMemoryVideoRepository } from './inmemory-video.repository';
import { InMemoryUserSettingRepository } from './inmemory-user-setting.repository';
import { getInMemoryStore } from './store';

/**
 * VideoRepository を作成
 *
 * @param docClient - DynamoDB Document Client（DynamoDB実装の場合に必要）
 * @param tableName - DynamoDB テーブル名（DynamoDB実装の場合に必要）
 * @returns VideoRepository インスタンス
 *
 * @remarks
 * 環境変数 `USE_IN_MEMORY_DB` が "true" の場合、InMemory実装を返す。
 * それ以外の場合は、DynamoDB実装を返す。
 */
export function createVideoRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): VideoRepository {
  const useInMemory = process.env.USE_IN_MEMORY_DB === 'true';

  if (useInMemory) {
    const store = getInMemoryStore();
    return new InMemoryVideoRepository(store);
  }

  if (!docClient || !tableName) {
    throw new Error('DynamoDB実装にはdocClientとtableNameが必要です');
  }

  return new DynamoDBVideoRepository(docClient, tableName);
}

/**
 * UserSettingRepository を作成
 *
 * @param docClient - DynamoDB Document Client（DynamoDB実装の場合に必要）
 * @param tableName - DynamoDB テーブル名（DynamoDB実装の場合に必要）
 * @returns UserSettingRepository インスタンス
 *
 * @remarks
 * 環境変数 `USE_IN_MEMORY_DB` が "true" の場合、InMemory実装を返す。
 * それ以外の場合は、DynamoDB実装を返す。
 *
 * InMemory実装では、VideoRepository と同じ InMemorySingleTableStore を共有する。
 * これにより、Single Table Design を正確に再現できる。
 */
export function createUserSettingRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): UserSettingRepository {
  const useInMemory = process.env.USE_IN_MEMORY_DB === 'true';

  if (useInMemory) {
    const store = getInMemoryStore();
    return new InMemoryUserSettingRepository(store);
  }

  if (!docClient || !tableName) {
    throw new Error('DynamoDB実装にはdocClientとtableNameが必要です');
  }

  return new DynamoDBUserSettingRepository(docClient, tableName);
}
