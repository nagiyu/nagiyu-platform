import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createRepositoryFactory } from '@nagiyu/aws';
import type { GroupRepository } from './group/group-repository.interface.js';
import { DynamoDBGroupRepository } from './group/dynamodb-group-repository.js';
import { InMemoryGroupRepository } from './group/in-memory-group-repository.js';
import type { UserRepository } from './user/user-repository.interface.js';
import { DynamoDBUserRepository } from './user/dynamodb-user-repository.js';
import { InMemoryUserRepository } from './user/in-memory-user-repository.js';
import type { MembershipRepository } from './membership/membership-repository.interface.js';
import { DynamoDBMembershipRepository } from './membership/dynamodb-membership-repository.js';
import { InMemoryMembershipRepository } from './membership/in-memory-membership-repository.js';
import type { ListRepository } from './list/list-repository.interface.js';
import { DynamoDBListRepository } from './list/dynamodb-list-repository.js';
import { InMemoryListRepository } from './list/in-memory-list-repository.js';
import type { TodoRepository } from './todo/todo-repository.interface.js';
import { DynamoDBTodoRepository } from './todo/dynamodb-todo-repository.js';
import { InMemoryTodoRepository } from './todo/in-memory-todo-repository.js';

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

export function resetInMemoryRepositories(): void {
  groupRepositoryFactory.resetRepository();
  userRepositoryFactory.resetRepository();
  membershipRepositoryFactory.resetRepository();
  listRepositoryFactory.resetRepository();
  todoRepositoryFactory.resetRepository();
}

export function createGroupRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): GroupRepository {
  return groupRepositoryFactory.createRepository(docClient, tableName);
}

export function createUserRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): UserRepository {
  return userRepositoryFactory.createRepository(docClient, tableName);
}

export function createMembershipRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): MembershipRepository {
  return membershipRepositoryFactory.createRepository(docClient, tableName);
}

export function createListRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ListRepository {
  return listRepositoryFactory.createRepository(docClient, tableName);
}

export function createTodoRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): TodoRepository {
  return todoRepositoryFactory.createRepository(docClient, tableName);
}

const groupRepositoryFactory = createRepositoryFactory<
  GroupRepository,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  createInMemoryRepository: () => new InMemoryGroupRepository(),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBGroupRepository(params.docClient, params.tableName);
  },
});

const userRepositoryFactory = createRepositoryFactory<
  UserRepository,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  createInMemoryRepository: () => new InMemoryUserRepository(),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBUserRepository(params.docClient, params.tableName);
  },
});

const membershipRepositoryFactory = createRepositoryFactory<
  MembershipRepository,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  createInMemoryRepository: () => new InMemoryMembershipRepository(),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBMembershipRepository(params.docClient, params.tableName);
  },
});

const listRepositoryFactory = createRepositoryFactory<
  ListRepository,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  createInMemoryRepository: () => new InMemoryListRepository(),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBListRepository(params.docClient, params.tableName);
  },
});

const todoRepositoryFactory = createRepositoryFactory<
  TodoRepository,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  createInMemoryRepository: () => new InMemoryTodoRepository(),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBTodoRepository(params.docClient, params.tableName);
  },
});
