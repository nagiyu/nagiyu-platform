import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore, registerDynamoRepositories } from '@nagiyu/aws';
import type { JobRepository } from './job.repository.interface.js';
import { DynamoDBJobRepository } from './dynamodb-job.repository.js';
import { InMemoryJobRepository } from './in-memory-job.repository.js';
import type { HighlightRepository } from './highlight.repository.interface.js';
import { DynamoDBHighlightRepository } from './dynamodb-highlight.repository.js';
import { InMemoryHighlightRepository } from './in-memory-highlight.repository.js';

const repositoryRegistry = registerDynamoRepositories<
  {
    job: JobRepository;
    highlight: HighlightRepository;
  },
  InMemorySingleTableStore
>(
  {
    job: {
      createInMemoryRepository: (store) => new InMemoryJobRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBJobRepository(docClient, tableName),
    },
    highlight: {
      createInMemoryRepository: (store) => new InMemoryHighlightRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBHighlightRepository(docClient, tableName),
    },
  },
  {
    keyPrefix: 'quick-clip',
    createSharedStore: () => new InMemorySingleTableStore(),
  }
);

/**
 * 全リポジトリのシングルトンと共有 InMemory ストアを破棄する
 *
 * テスト間で InMemory の状態を持ち越さないために使う
 */
export function resetInMemoryRepositories(): void {
  repositoryRegistry.resetAll();
}

export function createJobRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): JobRepository {
  return repositoryRegistry.job.createRepository(docClient, tableName);
}

export function createHighlightRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): HighlightRepository {
  return repositoryRegistry.highlight.createRepository(docClient, tableName);
}
