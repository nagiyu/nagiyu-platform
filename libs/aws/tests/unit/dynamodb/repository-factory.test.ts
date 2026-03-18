import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRepositoryFactory } from '../../../src/dynamodb/repository-factory.js';

describe('createRepositoryFactory', () => {
  beforeEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
  });

  it('USE_IN_MEMORY_DB=true の場合は InMemory 実装を返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const createInMemoryRepository = jest.fn(() => ({ type: 'in-memory' }));
    const createDynamoDBRepository = jest.fn(() => ({ type: 'dynamodb' }));

    const factory = createRepositoryFactory({
      createInMemoryRepository,
      createDynamoDBRepository,
    });

    const repository = factory.createRepository();

    expect(repository).toEqual({ type: 'in-memory' });
    expect(createInMemoryRepository).toHaveBeenCalledTimes(1);
    expect(createDynamoDBRepository).not.toHaveBeenCalled();
  });

  it('USE_IN_MEMORY_DB が未設定の場合は DynamoDB 実装を返す', () => {
    const createInMemoryRepository = jest.fn(() => ({ type: 'in-memory' }));
    const createDynamoDBRepository = jest.fn(() => ({ type: 'dynamodb' }));

    const factory = createRepositoryFactory({
      createInMemoryRepository,
      createDynamoDBRepository,
    });

    const repository = factory.createRepository();

    expect(repository).toEqual({ type: 'dynamodb' });
    expect(createDynamoDBRepository).toHaveBeenCalledTimes(1);
    expect(createInMemoryRepository).not.toHaveBeenCalled();
  });

  it('singleton=true の場合は同じインスタンスを返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const factory = createRepositoryFactory({
      createInMemoryRepository: () => ({ id: Symbol('repo') }),
      createDynamoDBRepository: () => ({ id: Symbol('repo') }),
    });

    const repository1 = factory.createRepository();
    const repository2 = factory.createRepository();

    expect(repository1).toBe(repository2);
  });

  it('resetRepository 実行後は新しいインスタンスを返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const factory = createRepositoryFactory({
      createInMemoryRepository: () => ({ id: Symbol('repo') }),
      createDynamoDBRepository: () => ({ id: Symbol('repo') }),
    });

    const repository1 = factory.createRepository();
    factory.resetRepository();
    const repository2 = factory.createRepository();

    expect(repository1).not.toBe(repository2);
  });

});
