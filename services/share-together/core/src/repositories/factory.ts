import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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

type InMemoryRepositories = {
  groupRepository: InMemoryGroupRepository;
  userRepository: InMemoryUserRepository;
  membershipRepository: InMemoryMembershipRepository;
  listRepository: InMemoryListRepository;
  todoRepository: InMemoryTodoRepository;
};

let inMemoryRepositories: InMemoryRepositories | null = null;

function createInMemoryRepositories(): InMemoryRepositories {
  return {
    groupRepository: new InMemoryGroupRepository(),
    userRepository: new InMemoryUserRepository(),
    membershipRepository: new InMemoryMembershipRepository(),
    listRepository: new InMemoryListRepository(),
    todoRepository: new InMemoryTodoRepository(),
  };
}

function getInMemoryRepositories(): InMemoryRepositories {
  if (!inMemoryRepositories) {
    inMemoryRepositories = createInMemoryRepositories();
  }
  return inMemoryRepositories;
}

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
  inMemoryRepositories = createInMemoryRepositories();
}

export function createGroupRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): GroupRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().groupRepository;
  }
  const params = requireDynamoParams(docClient, tableName);
  return new DynamoDBGroupRepository(params.docClient, params.tableName);
}

export function createUserRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): UserRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().userRepository;
  }
  const params = requireDynamoParams(docClient, tableName);
  return new DynamoDBUserRepository(params.docClient, params.tableName);
}

export function createMembershipRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): MembershipRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().membershipRepository;
  }
  const params = requireDynamoParams(docClient, tableName);
  return new DynamoDBMembershipRepository(params.docClient, params.tableName);
}

export function createListRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ListRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().listRepository;
  }
  const params = requireDynamoParams(docClient, tableName);
  return new DynamoDBListRepository(params.docClient, params.tableName);
}

export function createTodoRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): TodoRepository {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return getInMemoryRepositories().todoRepository;
  }
  const params = requireDynamoParams(docClient, tableName);
  return new DynamoDBTodoRepository(params.docClient, params.tableName);
}
