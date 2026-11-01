import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore, registerDynamoRepositories } from '@nagiyu/aws';
import type { JobRepository } from './job.repository.interface.js';
import { DynamoDBJobRepository } from './dynamodb-job.repository.js';
import { InMemoryJobRepository } from './in-memory-job.repository.js';

const repositoryRegistry = registerDynamoRepositories<
  {
    job: JobRepository;
  },
  InMemorySingleTableStore
>(
  {
    job: {
      createInMemoryRepository: (store) => new InMemoryJobRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBJobRepository(docClient, tableName),
    },
  },
  {
    keyPrefix: 'codec-converter',
    createSharedStore: () => new InMemorySingleTableStore(),
  }
);

/**
 * 生成済みのリポジトリと InMemory の共有 store をすべて破棄する。
 * リポジトリはシングルトンとして保持されるため、テスト間で状態を分離するときに呼ぶ。
 */
export function resetInMemoryRepositories(): void {
  repositoryRegistry.resetAll();
}

/**
 * ジョブリポジトリを返す。
 * USE_IN_MEMORY_DB=true のときは InMemory 実装、それ以外は DynamoDB 実装を返す。
 */
export function createJobRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): JobRepository {
  return repositoryRegistry.job.createRepository(docClient, tableName);
}
