type RepositoryFactoryConfig<TRepository, TArgs extends unknown[]> = {
  createInMemoryRepository: () => TRepository;
  createDynamoDBRepository: (...args: TArgs) => TRepository;
};

type RepositoryFactory<TRepository, TArgs extends unknown[]> = {
  createRepository: (...args: TArgs) => TRepository;
  resetRepository: () => void;
};

const DEFAULT_USE_IN_MEMORY_FLAG = 'USE_IN_MEMORY_DB';
const GLOBAL_INSTANCES_KEY = '__repositoryFactoryInstances__';

type GlobalWithInstances = typeof globalThis & {
  [GLOBAL_INSTANCES_KEY]?: Map<string, unknown>;
};

function getGlobalInstanceStore(): Map<string, unknown> {
  const g = globalThis as GlobalWithInstances;
  if (!g[GLOBAL_INSTANCES_KEY]) {
    g[GLOBAL_INSTANCES_KEY] = new Map<string, unknown>();
  }
  return g[GLOBAL_INSTANCES_KEY];
}

/**
 * 環境変数フラグに応じて InMemory / DynamoDB 実装を切り替える
 * Repository Factory を生成する。
 *
 * @remarks
 * 生成したリポジトリはシングルトンとして保持されるため、同一ファクトリーからは
 * 常に同じインスタンスが返される。テストなどで状態分離が必要な場合は
 * `resetRepository()` を呼び出してから再生成する。
 *
 * `instanceKey` を指定すると、同一プロセス内の全モジュールバンドルから
 * 同一のインスタンスを参照できる（Next.js dev モードのモジュール分離対策）。
 */
export function createRepositoryFactory<TRepository, TArgs extends unknown[] = []>(
  config: RepositoryFactoryConfig<TRepository, TArgs>,
  instanceKey?: string
): RepositoryFactory<TRepository, TArgs> {
  const { createInMemoryRepository, createDynamoDBRepository } = config;

  if (instanceKey !== undefined) {
    const store = getGlobalInstanceStore();
    return {
      createRepository: (...args: TArgs) => {
        const existing = store.get(instanceKey) as TRepository | undefined;
        if (existing) {
          return existing;
        }
        const repository =
          process.env[DEFAULT_USE_IN_MEMORY_FLAG] === 'true'
            ? createInMemoryRepository()
            : createDynamoDBRepository(...args);
        store.set(instanceKey, repository);
        return repository;
      },
      resetRepository: () => {
        store.delete(instanceKey);
      },
    };
  }

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
