jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn().mockReturnValue({}),
  getTableName: jest.fn().mockReturnValue('test-table'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
  registerDynamoRepositories: jest.fn().mockImplementation((config: {
    user: {
      createInMemoryRepository: () => unknown;
      createDynamoDBRepository: (opts: { docClient: unknown; tableName: string }) => unknown;
    };
  }) => {
    config.user.createInMemoryRepository();
    config.user.createDynamoDBRepository({ docClient: {}, tableName: 'test-table' });
    return {
      user: { createRepository: jest.fn().mockReturnValue({}) },
      resetAll: jest.fn(),
    };
  }),
}));

import { registerDynamoRepositories } from '@nagiyu/aws';
import { createUserRepository, resetUserRepository } from '../../../src/repositories/factory';

describe('createUserRepository', () => {
  it('UserRepository を返す', () => {
    const repo = createUserRepository();
    expect(repo).toBeDefined();
  });

  it('引数で docClient と tableName を渡せる', () => {
    const mockDocClient = {} as never;
    const repo = createUserRepository(mockDocClient, 'my-table');
    expect(repo).toBeDefined();

    const registry = (registerDynamoRepositories as jest.Mock).mock.results[0].value;
    expect(registry.user.createRepository).toHaveBeenCalledWith(mockDocClient, 'my-table');
  });
});

describe('resetUserRepository', () => {
  it('例外なく呼び出せる', () => {
    expect(() => resetUserRepository()).not.toThrow();

    const registry = (registerDynamoRepositories as jest.Mock).mock.results[0].value;
    expect(registry.resetAll).toHaveBeenCalled();
  });
});
