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
  InterestRepository,
  KnowledgeRepository,
  LifecycleRepository,
  MemoryRepository,
  MessageRepository,
  NotificationEventRepository,
  NoteRepository,
  ProfileRepository,
  PushSubscriptionRepository,
  StudyTopicRepository,
} from '@nagiyu/livetalk-core';
import {
  DynamoDBCharacterStateRepository,
  DynamoDBInterestRepository,
  DynamoDBKnowledgeRepository,
  DynamoDBLifecycleRepository,
  DynamoDBMemoryRepository,
  DynamoDBMessageRepository,
  DynamoDBNotificationEventRepository,
  DynamoDBNoteRepository,
  DynamoDBProfileRepository,
  DynamoDBPushSubscriptionRepository,
  DynamoDBStudyTopicRepository,
  InMemoryCharacterStateRepository,
  InMemoryInterestRepository,
  InMemoryKnowledgeRepository,
  InMemoryLifecycleRepository,
  InMemoryMemoryRepository,
  InMemoryMessageRepository,
  InMemoryNotificationEventRepository,
  InMemoryNoteRepository,
  InMemoryProfileRepository,
  InMemoryPushSubscriptionRepository,
  InMemoryStudyTopicRepository,
} from '@nagiyu/livetalk-core';

const registry = registerDynamoRepositories<
  {
    memory: MemoryRepository;
    message: MessageRepository;
    profile: ProfileRepository;
    characterState: CharacterStateRepository;
    interest: InterestRepository;
    lifecycle: LifecycleRepository;
    knowledge: KnowledgeRepository;
    studyTopic: StudyTopicRepository;
    note: NoteRepository;
    pushSubscription: PushSubscriptionRepository;
    notificationEvent: NotificationEventRepository;
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
    interest: {
      createInMemoryRepository: (store) => new InMemoryInterestRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBInterestRepository(docClient, tableName),
    },
    lifecycle: {
      createInMemoryRepository: (store) => new InMemoryLifecycleRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBLifecycleRepository(docClient, tableName),
    },
    knowledge: {
      createInMemoryRepository: (store) => new InMemoryKnowledgeRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBKnowledgeRepository(docClient, tableName),
    },
    studyTopic: {
      createInMemoryRepository: (store) => new InMemoryStudyTopicRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBStudyTopicRepository(docClient, tableName),
    },
    note: {
      createInMemoryRepository: (store) => new InMemoryNoteRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBNoteRepository(docClient, tableName),
    },
    pushSubscription: {
      createInMemoryRepository: (store) => new InMemoryPushSubscriptionRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBPushSubscriptionRepository(docClient, tableName),
    },
    notificationEvent: {
      createInMemoryRepository: (store) => new InMemoryNotificationEventRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBNotificationEventRepository(docClient, tableName),
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

export function getInterestRepository(): InterestRepository {
  return registry.interest.createRepository();
}

export function getLifecycleRepository(): LifecycleRepository {
  return registry.lifecycle.createRepository();
}

export function getKnowledgeRepository(): KnowledgeRepository {
  return registry.knowledge.createRepository();
}

export function getStudyTopicRepository(): StudyTopicRepository {
  return registry.studyTopic.createRepository();
}

export function getNoteRepository(): NoteRepository {
  return registry.note.createRepository();
}

export function getPushSubscriptionRepository(): PushSubscriptionRepository {
  return registry.pushSubscription.createRepository();
}

export function getNotificationEventRepository(): NotificationEventRepository {
  return registry.notificationEvent.createRepository();
}

/**
 * テスト・E2E 用：全リポジトリと共有 store を破棄する。
 */
export function resetRepositoriesForTesting(): void {
  registry.resetAll();
}
