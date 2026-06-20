/**
 * NiconicoMylistAssistant Core - Repository Factory
 *
 * Repository の生成を環境変数によって切り替える Factory パターン実装。
 * `@nagiyu/aws` の `registerDynamoRepositories` を使用し、
 * 4 リポジトリと共有 InMemorySingleTableStore を一括管理する。
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore, registerDynamoRepositories } from '@nagiyu/aws';
import type { VideoRepository } from './video.repository.interface.js';
import type { UserSettingRepository } from './user-setting.repository.interface.js';
import type { BatchJobRepository } from './batch-job.repository.interface.js';
import type { NiconicoCredentialRepository } from './niconico-credential.repository.interface.js';
import { DynamoDBVideoRepository } from './dynamodb-video.repository.js';
import { DynamoDBUserSettingRepository } from './dynamodb-user-setting.repository.js';
import { DynamoDBBatchJobRepository } from './dynamodb-batch-job.repository.js';
import { DynamoDBNiconicoCredentialRepository } from './dynamodb-niconico-credential.repository.js';
import { InMemoryVideoRepository } from './inmemory-video.repository.js';
import { InMemoryUserSettingRepository } from './inmemory-user-setting.repository.js';
import { InMemoryBatchJobRepository } from './inmemory-batch-job.repository.js';
import { InMemoryNiconicoCredentialRepository } from './inmemory-niconico-credential.repository.js';

const repositoryRegistry = registerDynamoRepositories<
  {
    video: VideoRepository;
    userSetting: UserSettingRepository;
    batchJob: BatchJobRepository;
    niconicoCredential: NiconicoCredentialRepository;
  },
  InMemorySingleTableStore
>(
  {
    video: {
      createInMemoryRepository: (store) => new InMemoryVideoRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBVideoRepository(docClient, tableName),
    },
    userSetting: {
      createInMemoryRepository: (store) => new InMemoryUserSettingRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBUserSettingRepository(docClient, tableName),
    },
    batchJob: {
      createInMemoryRepository: (store) => new InMemoryBatchJobRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBBatchJobRepository(docClient, tableName),
    },
    niconicoCredential: {
      createInMemoryRepository: (store) => new InMemoryNiconicoCredentialRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBNiconicoCredentialRepository(docClient, tableName),
    },
  },
  {
    createSharedStore: () => new InMemorySingleTableStore(),
  }
);

/**
 * VideoRepository を作成
 *
 * - `USE_IN_MEMORY_DB=true` のとき InMemory 実装（共有ストア使用）
 * - それ以外は DynamoDB 実装。引数省略時は env から自動取得
 */
export function createVideoRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): VideoRepository {
  return repositoryRegistry.video.createRepository(docClient, tableName);
}

/**
 * UserSettingRepository を作成
 *
 * InMemory 実装では Video / BatchJob と同じ InMemorySingleTableStore を共有する
 * （Single Table Design 再現）。
 */
export function createUserSettingRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): UserSettingRepository {
  return repositoryRegistry.userSetting.createRepository(docClient, tableName);
}

/**
 * BatchJobRepository を作成
 *
 * InMemory 実装では Video / UserSetting と同じ InMemorySingleTableStore を共有する。
 */
export function createBatchJobRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): BatchJobRepository {
  return repositoryRegistry.batchJob.createRepository(docClient, tableName);
}

/**
 * NiconicoCredentialRepository を作成
 *
 * InMemory 実装では他のリポジトリと同じ InMemorySingleTableStore を共有する
 * （Single Table Design 再現）。
 */
export function createNiconicoCredentialRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): NiconicoCredentialRepository {
  return repositoryRegistry.niconicoCredential.createRepository(docClient, tableName);
}

/**
 * Repository Factory のシングルトンと共有ストアを一括破棄する。
 * 主にユニットテストでテストケース間の状態を分離するために使用する。
 */
export function resetRepositoryFactories(): void {
  repositoryRegistry.resetAll();
}
