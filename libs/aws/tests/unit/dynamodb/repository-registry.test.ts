import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  registerDynamoRepositories,
  requireDynamoParams,
} from '../../../src/dynamodb/repository-registry.js';

describe('requireDynamoParams', () => {
  it('docClient と tableName が揃っていればそのまま返す', () => {
    const docClient = {} as never;
    const result = requireDynamoParams(docClient, 'MyTable');
    expect(result).toEqual({ docClient, tableName: 'MyTable' });
  });

  it('docClient が undefined のときはエラーを投げる', () => {
    expect(() => requireDynamoParams(undefined, 'MyTable')).toThrow(
      'DynamoDB 実装には docClient と tableName が必要です'
    );
  });

  it('tableName が undefined のときはエラーを投げる', () => {
    expect(() => requireDynamoParams({} as never, undefined)).toThrow(
      'DynamoDB 実装には docClient と tableName が必要です'
    );
  });
});

describe('registerDynamoRepositories', () => {
  beforeEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.DYNAMODB_TABLE_NAME;
  });

  it('USE_IN_MEMORY_DB=true の場合は各エントリで InMemory 実装を返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const createInMemoryUsers = jest.fn(() => ({ kind: 'in-memory-users' }));
    const createInMemoryItems = jest.fn(() => ({ kind: 'in-memory-items' }));

    const registry = registerDynamoRepositories({
      users: {
        createInMemoryRepository: createInMemoryUsers,
        createDynamoDBRepository: () => ({ kind: 'dynamodb-users' }),
      },
      items: {
        createInMemoryRepository: createInMemoryItems,
        createDynamoDBRepository: () => ({ kind: 'dynamodb-items' }),
      },
    });

    expect(registry.users.createRepository()).toEqual({ kind: 'in-memory-users' });
    expect(registry.items.createRepository()).toEqual({ kind: 'in-memory-items' });
    expect(createInMemoryUsers).toHaveBeenCalledTimes(1);
    expect(createInMemoryItems).toHaveBeenCalledTimes(1);
  });

  it('引数明示時はそれを優先し env 自動取得を行わない', () => {
    const docClient = { id: 'explicit' } as never;
    const tableName = 'ExplicitTable';
    const createDynamoDBRepository = jest.fn(({ docClient: c, tableName: t }) => ({ c, t }));

    const registry = registerDynamoRepositories({
      users: {
        createInMemoryRepository: () => ({ kind: 'in-memory' }),
        createDynamoDBRepository,
      },
    });

    const repo = registry.users.createRepository(docClient, tableName);
    expect(repo).toEqual({ c: docClient, t: tableName });
    expect(createDynamoDBRepository).toHaveBeenCalledWith({ docClient, tableName });
  });

  it('引数省略時は env から tableName を取得する', () => {
    process.env.DYNAMODB_TABLE_NAME = 'EnvTable';
    const createDynamoDBRepository = jest.fn(({ tableName }) => ({ tableName }));

    const registry = registerDynamoRepositories({
      users: {
        createInMemoryRepository: () => ({ kind: 'in-memory' }),
        createDynamoDBRepository,
      },
    });

    const repo = registry.users.createRepository();
    expect(repo).toEqual({ tableName: 'EnvTable' });
  });

  it('tableName が引数・env のいずれでも未指定ならエラーを投げる', () => {
    const registry = registerDynamoRepositories({
      users: {
        createInMemoryRepository: () => ({ kind: 'in-memory' }),
        createDynamoDBRepository: () => ({ kind: 'dynamodb' }),
      },
    });

    expect(() => registry.users.createRepository()).toThrow(
      '環境変数 DYNAMODB_TABLE_NAME が設定されていません'
    );
  });

  it('同一エントリは singleton として同じインスタンスを返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const registry = registerDynamoRepositories({
      users: {
        createInMemoryRepository: () => ({ id: Symbol('users') }),
        createDynamoDBRepository: () => ({ id: Symbol('users') }),
      },
    });

    const a = registry.users.createRepository();
    const b = registry.users.createRepository();
    expect(a).toBe(b);
  });

  it('resetRepository は単一エントリの状態のみ破棄する', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const registry = registerDynamoRepositories({
      users: {
        createInMemoryRepository: () => ({ id: Symbol('users') }),
        createDynamoDBRepository: () => ({ id: Symbol('users') }),
      },
      items: {
        createInMemoryRepository: () => ({ id: Symbol('items') }),
        createDynamoDBRepository: () => ({ id: Symbol('items') }),
      },
    });

    const usersBefore = registry.users.createRepository();
    const itemsBefore = registry.items.createRepository();
    registry.users.resetRepository();
    const usersAfter = registry.users.createRepository();
    const itemsAfter = registry.items.createRepository();

    expect(usersAfter).not.toBe(usersBefore);
    expect(itemsAfter).toBe(itemsBefore);
  });

  it('resetAll は全エントリを破棄する', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const registry = registerDynamoRepositories({
      users: {
        createInMemoryRepository: () => ({ id: Symbol('users') }),
        createDynamoDBRepository: () => ({ id: Symbol('users') }),
      },
      items: {
        createInMemoryRepository: () => ({ id: Symbol('items') }),
        createDynamoDBRepository: () => ({ id: Symbol('items') }),
      },
    });

    const usersBefore = registry.users.createRepository();
    const itemsBefore = registry.items.createRepository();
    registry.resetAll();
    const usersAfter = registry.users.createRepository();
    const itemsAfter = registry.items.createRepository();

    expect(usersAfter).not.toBe(usersBefore);
    expect(itemsAfter).not.toBe(itemsBefore);
  });

  it('createSharedStore 指定時は同じ store が全エントリに渡される', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const sharedStore = { items: new Map<string, unknown>() };
    const createSharedStore = jest.fn(() => sharedStore);
    const usersStore: (typeof sharedStore)[] = [];
    const itemsStore: (typeof sharedStore)[] = [];

    const registry = registerDynamoRepositories(
      {
        users: {
          createInMemoryRepository: (store) => {
            usersStore.push(store);
            return { kind: 'users' };
          },
          createDynamoDBRepository: () => ({ kind: 'users' }),
        },
        items: {
          createInMemoryRepository: (store) => {
            itemsStore.push(store);
            return { kind: 'items' };
          },
          createDynamoDBRepository: () => ({ kind: 'items' }),
        },
      },
      { createSharedStore }
    );

    registry.users.createRepository();
    registry.items.createRepository();

    expect(usersStore[0]).toBe(sharedStore);
    expect(itemsStore[0]).toBe(sharedStore);
    expect(createSharedStore).toHaveBeenCalledTimes(1);
  });

  it('resetAll 後に共有 store も再生成される', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const createSharedStore = jest
      .fn(() => ({ id: Symbol('store') }))
      .mockName('createSharedStore');

    const registry = registerDynamoRepositories(
      {
        users: {
          createInMemoryRepository: () => ({ kind: 'users' }),
          createDynamoDBRepository: () => ({ kind: 'users' }),
        },
      },
      { createSharedStore }
    );

    registry.users.createRepository();
    expect(createSharedStore).toHaveBeenCalledTimes(1);

    registry.resetAll();
    registry.users.createRepository();
    expect(createSharedStore).toHaveBeenCalledTimes(2);
  });

  it('keyPrefix 指定時は globalThis 上に instanceKey が設定される', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const registry = registerDynamoRepositories(
      {
        users: {
          createInMemoryRepository: () => ({ kind: 'users' }),
          createDynamoDBRepository: () => ({ kind: 'users' }),
        },
      },
      { keyPrefix: 'test-service' }
    );

    registry.users.createRepository();
    const globalStore = (
      globalThis as typeof globalThis & {
        __repositoryFactoryInstances__?: Map<string, unknown>;
      }
    ).__repositoryFactoryInstances__;
    expect(globalStore?.has('test-service.users')).toBe(true);

    registry.resetAll();
    expect(globalStore?.has('test-service.users')).toBe(false);
  });
});
