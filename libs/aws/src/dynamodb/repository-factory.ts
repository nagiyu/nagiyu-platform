type RepositoryFactoryConfig<TRepository, TArgs extends unknown[]> = {
  createInMemoryRepository: () => TRepository;
  createDynamoDBRepository: (...args: TArgs) => TRepository;
};

type RepositoryFactory<TRepository, TArgs extends unknown[]> = {
  createRepository: (...args: TArgs) => TRepository;
  resetRepository: () => void;
};

const DEFAULT_USE_IN_MEMORY_FLAG = 'USE_IN_MEMORY_DB';

/**
 * 環境変数フラグに応じて InMemory / DynamoDB 実装を切り替える
 * Repository Factory を生成する。
 *
 * @remarks
 * 生成したリポジトリはシングルトンとして保持されるため、同一ファクトリーからは
 * 常に同じインスタンスが返される。テストなどで状態分離が必要な場合は
 * `resetRepository()` を呼び出してから再生成する。
 */
export function createRepositoryFactory<TRepository, TArgs extends unknown[] = []>(
  config: RepositoryFactoryConfig<TRepository, TArgs>
): RepositoryFactory<TRepository, TArgs> {
  const { createInMemoryRepository, createDynamoDBRepository } = config;

  let repositoryInstance: TRepository | null = null;

  return {
    createRepository: (...args: TArgs) => {
      if (repositoryInstance) {
        return repositoryInstance;
      }

      const repository =
        process.env[DEFAULT_USE_IN_MEMORY_FLAG] === 'true'
          ? createInMemoryRepository()
          : createDynamoDBRepository(...args);

      repositoryInstance = repository;

      return repository;
    },
    resetRepository: () => {
      repositoryInstance = null;
    },
  };
}
