import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getDynamoDBDocumentClient, getTableName } from './client.js';
import { createRepositoryFactory } from './repository-factory.js';

const ERROR_MESSAGES = {
  DYNAMODB_PARAMS_REQUIRED: 'DynamoDB 実装には docClient と tableName が必要です',
} as const;

/**
 * DynamoDB Repository 生成時に渡される必須パラメータ。
 */
export type DynamoRepositoryParams = {
  docClient: DynamoDBDocumentClient;
  tableName: string;
};

/**
 * docClient / tableName の双方が解決済みであることを保証するヘルパー。
 * 各サービスで重複していた `requireDynamoParams` 実装を集約したもの。
 */
export function requireDynamoParams(
  docClient: DynamoDBDocumentClient | undefined,
  tableName: string | undefined
): DynamoRepositoryParams {
  if (!docClient || !tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_PARAMS_REQUIRED);
  }
  return { docClient, tableName };
}

/**
 * Registry に登録する 1 件の Repository 定義。
 *
 * @typeParam TRepo  - Repository 型
 * @typeParam TStore - InMemory 共有 store 型（共有不要なら `undefined`）
 */
export type DynamoRepositoryDef<TRepo, TStore = undefined> = {
  createInMemoryRepository: (sharedStore: TStore) => TRepo;
  createDynamoDBRepository: (params: DynamoRepositoryParams) => TRepo;
};

/**
 * Registry の各 Repository に対応するハンドル。
 * 引数省略時は env から `getDynamoDBDocumentClient()` / `getTableName()` で自動解決する。
 */
export type DynamoRepositoryHandle<TRepo> = {
  createRepository(docClient?: DynamoDBDocumentClient, tableName?: string): TRepo;
  resetRepository(): void;
};

/**
 * `registerDynamoRepositories()` の戻り値。各エントリの `createRepository` / `resetRepository` と、
 * 共有 store も含めて一括破棄する `resetAll()` を提供する。
 */
export type DynamoRepositoryRegistry<TMap extends Record<string, unknown>> = {
  [K in keyof TMap]: DynamoRepositoryHandle<TMap[K]>;
} & {
  resetAll(): void;
};

/**
 * `registerDynamoRepositories()` のオプション。
 */
export type RegisterDynamoRepositoriesOptions<TStore = undefined> = {
  /**
   * Next.js dev モードでの module isolation 対策。
   * 指定すると各 factory に `${keyPrefix}.${repositoryName}` が instanceKey として自動付与される。
   */
  keyPrefix?: string;
  /**
   * InMemory 実装で複数 Repository が共有する store の生成関数。
   * 指定すると各 `createInMemoryRepository` に共有 store が渡される。
   * `resetAll()` 実行時には store も破棄され、次回の InMemory 生成時に再構築される。
   */
  createSharedStore?: () => TStore;
};

type AnyHandleMap = Record<string, DynamoRepositoryHandle<unknown>>;

/**
 * 複数の DynamoDB Repository を 1 つの定義オブジェクトで一括登録する Registry を生成する。
 *
 * - `process.env.USE_IN_MEMORY_DB === 'true'` のとき InMemory 実装を返す
 * - それ以外で引数明示時は渡された `docClient` / `tableName` を使い、省略時は env から自動取得する
 * - 一度生成した Repository はシングルトンとして再利用される
 * - `keyPrefix` 指定時は Next.js dev モード対策として globalThis に保持される
 *
 * @example
 * ```ts
 * const registry = registerDynamoRepositories({
 *   user: {
 *     createInMemoryRepository: () => new InMemoryUserRepository(),
 *     createDynamoDBRepository: ({ docClient, tableName }) =>
 *       new DynamoDBUserRepository(docClient, tableName),
 *   },
 * }, { keyPrefix: 'auth' });
 *
 * const repo = registry.user.createRepository();
 * ```
 */
export function registerDynamoRepositories<
  TMap extends Record<string, unknown>,
  TStore = undefined,
>(
  defs: { [K in keyof TMap]: DynamoRepositoryDef<TMap[K], TStore> },
  options?: RegisterDynamoRepositoriesOptions<TStore>
): DynamoRepositoryRegistry<TMap> {
  const keyPrefix = options?.keyPrefix;
  const createSharedStore = options?.createSharedStore;

  let sharedStore: TStore | undefined;
  let sharedStoreInitialized = false;

  const resolveSharedStore = (): TStore => {
    if (!createSharedStore) {
      return undefined as TStore;
    }
    if (!sharedStoreInitialized) {
      sharedStore = createSharedStore();
      sharedStoreInitialized = true;
    }
    return sharedStore as TStore;
  };

  const handles: AnyHandleMap = {};
  const factories: Array<{ resetRepository(): void }> = [];

  for (const name of Object.keys(defs) as Array<keyof TMap & string>) {
    const def = defs[name];
    const instanceKey = keyPrefix ? `${keyPrefix}.${name}` : undefined;

    const factory = createRepositoryFactory<
      TMap[typeof name],
      [DynamoDBDocumentClient | undefined, string | undefined]
    >(
      {
        createInMemoryRepository: () => def.createInMemoryRepository(resolveSharedStore()),
        createDynamoDBRepository: (docClient, tableName) => {
          const resolvedDocClient = docClient ?? getDynamoDBDocumentClient();
          const resolvedTableName = tableName ?? getTableName();
          const params = requireDynamoParams(resolvedDocClient, resolvedTableName);
          return def.createDynamoDBRepository(params);
        },
      },
      instanceKey
    );

    factories.push(factory);
    handles[name] = {
      createRepository: (docClient, tableName) => factory.createRepository(docClient, tableName),
      resetRepository: () => factory.resetRepository(),
    };
  }

  const registry = handles as unknown as DynamoRepositoryRegistry<TMap>;
  registry.resetAll = () => {
    for (const factory of factories) {
      factory.resetRepository();
    }
    sharedStore = undefined;
    sharedStoreInitialized = false;
  };

  return registry;
}
