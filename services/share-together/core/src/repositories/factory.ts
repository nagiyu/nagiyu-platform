import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { registerDynamoRepositories } from '@nagiyu/aws';
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

const repositoryRegistry = registerDynamoRepositories<{
  group: GroupRepository;
  user: UserRepository;
  membership: MembershipRepository;
  list: ListRepository;
  todo: TodoRepository;
}>(
  {
    group: {
      createInMemoryRepository: () => new InMemoryGroupRepository(),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBGroupRepository(docClient, tableName),
    },
    user: {
      createInMemoryRepository: () => new InMemoryUserRepository(),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBUserRepository(docClient, tableName),
    },
    membership: {
      createInMemoryRepository: () => new InMemoryMembershipRepository(),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBMembershipRepository(docClient, tableName),
    },
    list: {
      createInMemoryRepository: () => new InMemoryListRepository(),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBListRepository(docClient, tableName),
    },
    todo: {
      createInMemoryRepository: () => new InMemoryTodoRepository(),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBTodoRepository(docClient, tableName),
    },
  },
  { keyPrefix: 'share-together' }
);

export function resetInMemoryRepositories(): void {
  repositoryRegistry.resetAll();
}

export function createGroupRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): GroupRepository {
  return repositoryRegistry.group.createRepository(docClient, tableName);
}

export function createUserRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): UserRepository {
  return repositoryRegistry.user.createRepository(docClient, tableName);
}

export function createMembershipRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): MembershipRepository {
  return repositoryRegistry.membership.createRepository(docClient, tableName);
}

export function createListRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): ListRepository {
  return repositoryRegistry.list.createRepository(docClient, tableName);
}

export function createTodoRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): TodoRepository {
  return repositoryRegistry.todo.createRepository(docClient, tableName);
}
