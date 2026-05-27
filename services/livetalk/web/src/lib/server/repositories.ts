/**
 * リブトーク Web 層が使う DynamoDB リポジトリのファクトリ。
 *
 * - 本番 / dev: 既存の `@nagiyu/aws` クライアントから生成した DynamoDB Document Client を使う
 * - テスト・ローカル: `USE_IN_MEMORY_DB=true` で全リポジトリが共有の InMemory store に差し替わる
 *
 * 各リポジトリはシングルトンとして再利用される。
 */

import { InMemorySingleTableStore, registerDynamoRepositories } from '@nagiyu/aws';
import type {
  CharacterStateRepository,
  MemoryRepository,
  MessageRepository,
  ProfileRepository,
} from '@nagiyu/livetalk-core';
import {
  DynamoDBCharacterStateRepository,
  DynamoDBMemoryRepository,
  DynamoDBMessageRepository,
  DynamoDBProfileRepository,
  InMemoryCharacterStateRepository,
  InMemoryMemoryRepository,
  InMemoryMessageRepository,
  InMemoryProfileRepository,
} from '@nagiyu/livetalk-core';

const registry = registerDynamoRepositories<
  {
    memory: MemoryRepository;
    message: MessageRepository;
    profile: ProfileRepository;
    characterState: CharacterStateRepository;
  },
  InMemorySingleTableStore
>(
  {
    memory: {
      createInMemoryRepository: (store) => new InMemoryMemoryRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBMemoryRepository(docClient, tableName),
    },
    message: {
      createInMemoryRepository: (store) => new InMemoryMessageRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBMessageRepository(docClient, tableName),
    },
    profile: {
      createInMemoryRepository: (store) => new InMemoryProfileRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBProfileRepository(docClient, tableName),
    },
    characterState: {
      createInMemoryRepository: (store) => new InMemoryCharacterStateRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBCharacterStateRepository(docClient, tableName),
    },
  },
  {
    keyPrefix: 'livetalk',
    createSharedStore: () => new InMemorySingleTableStore(),
  }
);

export function getMemoryRepository(): MemoryRepository {
  return registry.memory.createRepository();
}

export function getMessageRepository(): MessageRepository {
  return registry.message.createRepository();
}

export function getProfileRepository(): ProfileRepository {
  return registry.profile.createRepository();
}

export function getCharacterStateRepository(): CharacterStateRepository {
  return registry.characterState.createRepository();
}

/**
 * テスト・E2E 用：全リポジトリと共有 store を破棄する。
 */
export function resetRepositoriesForTesting(): void {
  registry.resetAll();
}
