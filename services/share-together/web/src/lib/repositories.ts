import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBGroupRepository,
  DynamoDBListRepository,
  DynamoDBMembershipRepository,
  DynamoDBTodoRepository,
  DynamoDBUserRepository,
  InMemoryGroupRepository,
  InMemoryListRepository,
  InMemoryMembershipRepository,
  InMemoryTodoRepository,
  InMemoryUserRepository,
  type GroupRepository,
  type ListRepository,
  type MembershipRepository,
  type TodoRepository,
  type UserRepository,
} from '@nagiyu/share-together-core';

const ERROR_MESSAGES = {
  DYNAMODB_PARAMS_REQUIRED: 'DynamoDB実装にはdocClientとtableNameが必要です',
} as const;

type InMemoryRepositories = {
  groupRepository: InMemoryGroupRepository;
  listRepository: InMemoryListRepository;
  membershipRepository: InMemoryMembershipRepository;
  todoRepository: InMemoryTodoRepository;
  userRepository: InMemoryUserRepository;
};

let inMemoryRepositories: InMemoryRepositories | null = null;

function getInMemoryRepositories(): InMemoryRepositories {
  if (!inMemoryRepositories) {
    inMemoryRepositories = {
      groupRepository: new InMemoryGroupRepository(),
      listRepository: new InMemoryListRepository(),
      membershipRepository: new InMemoryMembershipRepository(),
      todoRepository: new InMemoryTodoRepository(),
      userRepository: new InMemoryUserRepository(),
    };
  }
  return inMemoryRepositories;
}

export function resetInMemoryRepositories(): void {
  inMemoryRepositories = null;
}

function assertDynamoParams(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): { docClient: DynamoDBDocumentClient; tableName: string } {
  if (!docClient || !tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_PARAMS_REQUIRED);
  }
  return { docClient, tableName };
}

export function createGroupRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): GroupRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().groupRepository;
  }
  const params = assertDynamoParams(docClient, tableName);
  return new DynamoDBGroupRepository(params.docClient, params.tableName);
}

export function createListRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ListRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().listRepository;
  }
  const params = assertDynamoParams(docClient, tableName);
  return new DynamoDBListRepository(params.docClient, params.tableName);
}

export function createMembershipRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): MembershipRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().membershipRepository;
  }
  const params = assertDynamoParams(docClient, tableName);
  return new DynamoDBMembershipRepository(params.docClient, params.tableName);
}

export function createTodoRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): TodoRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().todoRepository;
  }
  const params = assertDynamoParams(docClient, tableName);
  return new DynamoDBTodoRepository(params.docClient, params.tableName);
}

export function createUserRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): UserRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().userRepository;
  }
  const params = assertDynamoParams(docClient, tableName);
  return new DynamoDBUserRepository(params.docClient, params.tableName);
}
