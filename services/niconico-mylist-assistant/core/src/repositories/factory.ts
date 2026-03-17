/**
 * NiconicoMylistAssistant Core - Repository Factory
 *
 * Repository の生成を環境変数によって切り替える Factory パターン実装
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createRepositoryFactory } from '@nagiyu/aws';
import type { VideoRepository } from './video.repository.interface.js';
import type { UserSettingRepository } from './user-setting.repository.interface.js';
import type { BatchJobRepository } from './batch-job.repository.interface.js';
import { DynamoDBVideoRepository } from './dynamodb-video.repository.js';
import { DynamoDBUserSettingRepository } from './dynamodb-user-setting.repository.js';
import { DynamoDBBatchJobRepository } from './dynamodb-batch-job.repository.js';
import { InMemoryVideoRepository } from './inmemory-video.repository.js';
import { InMemoryUserSettingRepository } from './inmemory-user-setting.repository.js';
import { InMemoryBatchJobRepository } from './inmemory-batch-job.repository.js';
import { getInMemoryStore } from './store.js';

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
  return videoRepositoryFactory.createRepository(docClient, tableName);
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
  return userSettingRepositoryFactory.createRepository(docClient, tableName);
}

/**
 * BatchJobRepository を作成
 *
 * @param docClient - DynamoDB Document Client（DynamoDB実装の場合に必要）
 * @param tableName - DynamoDB テーブル名（DynamoDB実装の場合に必要）
 * @returns BatchJobRepository インスタンス
 *
 * @remarks
 * 環境変数 `USE_IN_MEMORY_DB` が "true" の場合、InMemory実装を返す。
 * それ以外の場合は、DynamoDB実装を返す。
 *
 * InMemory実装では、VideoRepository と同じ InMemorySingleTableStore を共有する。
 * これにより、Single Table Design を正確に再現できる。
 */
export function createBatchJobRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): BatchJobRepository {
  return batchJobRepositoryFactory.createRepository(docClient, tableName);
}

const ERROR_MESSAGES = {
  DYNAMODB_PARAMS_REQUIRED: 'DynamoDB実装にはdocClientとtableNameが必要です',
} as const;

function requireDynamoParams(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): { docClient: DynamoDBDocumentClient; tableName: string } {
  if (!docClient || !tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_PARAMS_REQUIRED);
  }
  return { docClient, tableName };
}

const videoRepositoryFactory = createRepositoryFactory<
  VideoRepository,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  singleton: false,
  createInMemoryRepository: () => new InMemoryVideoRepository(getInMemoryStore()),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBVideoRepository(params.docClient, params.tableName);
  },
});

const userSettingRepositoryFactory = createRepositoryFactory<
  UserSettingRepository,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  singleton: false,
  createInMemoryRepository: () => new InMemoryUserSettingRepository(getInMemoryStore()),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBUserSettingRepository(params.docClient, params.tableName);
  },
});

const batchJobRepositoryFactory = createRepositoryFactory<
  BatchJobRepository,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  singleton: false,
  createInMemoryRepository: () => new InMemoryBatchJobRepository(getInMemoryStore()),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBBatchJobRepository(params.docClient, params.tableName);
  },
});
