type RepositoryFactoryConfig<TRepository, TArgs extends unknown[]> = {
  createInMemoryRepository: () => TRepository;
  createDynamoDBRepository: (...args: TArgs) => TRepository;
  useInMemoryFlagName?: string;
  singleton?: boolean;
};

type RepositoryFactory<TRepository, TArgs extends unknown[]> = {
  createRepository: (...args: TArgs) => TRepository;
  resetRepository: () => void;
};

const DEFAULT_USE_IN_MEMORY_FLAG = 'USE_IN_MEMORY_DB';

/**
 * 環境変数フラグに応じて InMemory / DynamoDB 実装を切り替える
 * Repository Factory を生成する。
 */
export function createRepositoryFactory<TRepository, TArgs extends unknown[] = []>(
  config: RepositoryFactoryConfig<TRepository, TArgs>
): RepositoryFactory<TRepository, TArgs> {
  const { createInMemoryRepository, createDynamoDBRepository, singleton = true } = config;
  const useInMemoryFlagName = config.useInMemoryFlagName ?? DEFAULT_USE_IN_MEMORY_FLAG;

  let repositoryInstance: TRepository | null = null;

  return {
    createRepository: (...args: TArgs) => {
      if (singleton && repositoryInstance) {
        return repositoryInstance;
      }

      const repository =
        process.env[useInMemoryFlagName] === 'true'
          ? createInMemoryRepository()
          : createDynamoDBRepository(...args);

      if (singleton) {
        repositoryInstance = repository;
      }

      return repository;
    },
    resetRepository: () => {
      repositoryInstance = null;
    },
  };
}
