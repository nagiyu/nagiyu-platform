/**
 * リブトークのリポジトリ生成口。
 *
 * - 本番 / dev: 引数の docClient / tableName、省略時は `@nagiyu/aws` が環境変数から解決したものを使う
 * - テスト・ローカル: `USE_IN_MEMORY_DB=true` で全リポジトリが共有の InMemory store に差し替わる
 *
 * 各リポジトリはシングルトンとして再利用される。共有 store を使うため、
 * InMemory では同じ store を介してリポジトリ間のデータが見える。
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore, registerDynamoRepositories } from '@nagiyu/aws';

import type { AccountDeletionRepository } from './account-deletion.repository.interface.js';
import { DynamoDBAccountDeletionRepository } from './dynamodb-account-deletion.repository.js';
import { InMemoryAccountDeletionRepository } from './in-memory-account-deletion.repository.js';
import type { ChatGuardRepository } from './chat-guard.repository.interface.js';
import { DynamoDBChatGuardRepository } from './dynamodb-chat-guard.repository.js';
import { InMemoryChatGuardRepository } from './in-memory-chat-guard.repository.js';
import type { MessageRepository } from './message.repository.interface.js';
import { DynamoDBMessageRepository } from './dynamodb-message.repository.js';
import { InMemoryMessageRepository } from './in-memory-message.repository.js';
import type { ProfileRepository } from './profile.repository.interface.js';
import { DynamoDBProfileRepository } from './dynamodb-profile.repository.js';
import { InMemoryProfileRepository } from './in-memory-profile.repository.js';
import type { CharacterStateRepository } from './character-state.repository.interface.js';
import { DynamoDBCharacterStateRepository } from './dynamodb-character-state.repository.js';
import { InMemoryCharacterStateRepository } from './in-memory-character-state.repository.js';
import type { LifecycleRepository } from './lifecycle.repository.interface.js';
import { DynamoDBLifecycleRepository } from './dynamodb-lifecycle.repository.js';
import { InMemoryLifecycleRepository } from './in-memory-lifecycle.repository.js';
import type { StudyTopicRepository } from './study-topic.repository.interface.js';
import { DynamoDBStudyTopicRepository } from './dynamodb-study-topic.repository.js';
import { InMemoryStudyTopicRepository } from './in-memory-study-topic.repository.js';
import type { NoteRepository } from './note.repository.interface.js';
import { DynamoDBNoteRepository } from './dynamodb-note.repository.js';
import { InMemoryNoteRepository } from './in-memory-note.repository.js';
import type { PushSubscriptionRepository } from './push-subscription.repository.interface.js';
import { DynamoDBPushSubscriptionRepository } from './dynamodb-push-subscription.repository.js';
import { InMemoryPushSubscriptionRepository } from './in-memory-push-subscription.repository.js';
import type { NotificationEventRepository } from './notification-event.repository.interface.js';
import { DynamoDBNotificationEventRepository } from './dynamodb-notification-event.repository.js';
import { InMemoryNotificationEventRepository } from './in-memory-notification-event.repository.js';
import type { TopicRepository } from './topic.repository.interface.js';
import { DynamoDBTopicRepository } from './dynamodb-topic.repository.js';
import { InMemoryTopicRepository } from './in-memory-topic.repository.js';
import type { ConsolidationCursorRepository } from './consolidation-cursor.repository.interface.js';
import { DynamoDBConsolidationCursorRepository } from './dynamodb-consolidation-cursor.repository.js';
import { InMemoryConsolidationCursorRepository } from './in-memory-consolidation-cursor.repository.js';
import type { WebRawRepository } from './webraw.repository.interface.js';
import { DynamoDBWebRawRepository } from './dynamodb-webraw.repository.js';
import { InMemoryWebRawRepository } from './in-memory-webraw.repository.js';

const repositoryRegistry = registerDynamoRepositories<
  {
    accountDeletion: AccountDeletionRepository;
    chatGuard: ChatGuardRepository;
    message: MessageRepository;
    profile: ProfileRepository;
    characterState: CharacterStateRepository;
    lifecycle: LifecycleRepository;
    studyTopic: StudyTopicRepository;
    note: NoteRepository;
    pushSubscription: PushSubscriptionRepository;
    notificationEvent: NotificationEventRepository;
    topic: TopicRepository;
    consolidationCursor: ConsolidationCursorRepository;
    webRaw: WebRawRepository;
  },
  InMemorySingleTableStore
>(
  {
    accountDeletion: {
      createInMemoryRepository: (store) => new InMemoryAccountDeletionRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBAccountDeletionRepository(docClient, tableName),
    },
    chatGuard: {
      createInMemoryRepository: (store) => new InMemoryChatGuardRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBChatGuardRepository(docClient, tableName),
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
    lifecycle: {
      createInMemoryRepository: (store) => new InMemoryLifecycleRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBLifecycleRepository(docClient, tableName),
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
    topic: {
      createInMemoryRepository: (store) => new InMemoryTopicRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBTopicRepository(docClient, tableName),
    },
    consolidationCursor: {
      createInMemoryRepository: (store) => new InMemoryConsolidationCursorRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBConsolidationCursorRepository(docClient, tableName),
    },
    webRaw: {
      createInMemoryRepository: (store) => new InMemoryWebRawRepository(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBWebRawRepository(docClient, tableName),
    },
  },
  {
    keyPrefix: 'livetalk',
    createSharedStore: () => new InMemorySingleTableStore(),
  }
);

/**
 * 全リポジトリと共有 store を破棄する。
 * シングルトンがテスト間で状態を持ち越さないよう、テスト・E2E のリセット用に使う。
 */
export function resetRepositoryFactories(): void {
  repositoryRegistry.resetAll();
}

export function createAccountDeletionRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): AccountDeletionRepository {
  return repositoryRegistry.accountDeletion.createRepository(docClient, tableName);
}

export function createChatGuardRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ChatGuardRepository {
  return repositoryRegistry.chatGuard.createRepository(docClient, tableName);
}

export function createMessageRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): MessageRepository {
  return repositoryRegistry.message.createRepository(docClient, tableName);
}

export function createProfileRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ProfileRepository {
  return repositoryRegistry.profile.createRepository(docClient, tableName);
}

export function createCharacterStateRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): CharacterStateRepository {
  return repositoryRegistry.characterState.createRepository(docClient, tableName);
}

export function createLifecycleRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): LifecycleRepository {
  return repositoryRegistry.lifecycle.createRepository(docClient, tableName);
}

export function createStudyTopicRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): StudyTopicRepository {
  return repositoryRegistry.studyTopic.createRepository(docClient, tableName);
}

export function createNoteRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): NoteRepository {
  return repositoryRegistry.note.createRepository(docClient, tableName);
}

export function createPushSubscriptionRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): PushSubscriptionRepository {
  return repositoryRegistry.pushSubscription.createRepository(docClient, tableName);
}

export function createNotificationEventRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): NotificationEventRepository {
  return repositoryRegistry.notificationEvent.createRepository(docClient, tableName);
}

export function createTopicRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): TopicRepository {
  return repositoryRegistry.topic.createRepository(docClient, tableName);
}

export function createConsolidationCursorRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ConsolidationCursorRepository {
  return repositoryRegistry.consolidationCursor.createRepository(docClient, tableName);
}

export function createWebRawRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): WebRawRepository {
  return repositoryRegistry.webRaw.createRepository(docClient, tableName);
}
