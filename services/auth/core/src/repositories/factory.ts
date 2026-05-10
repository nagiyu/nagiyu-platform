import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { registerDynamoRepositories } from '@nagiyu/aws';
import { DynamoDBUserRepository } from './dynamodb-user-repository';
import { InMemoryUserRepository } from './in-memory-user-repository';
import type { UserRepository } from './user-repository';

const userRegistry = registerDynamoRepositories<{
  user: UserRepository;
}>(
  {
    user: {
      createInMemoryRepository: () => new InMemoryUserRepository(),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBUserRepository(docClient, tableName),
    },
  },
  { keyPrefix: 'auth' }
);

/**
 * UserRepository を生成する。
 *
 * - `USE_IN_MEMORY_DB=true` のとき InMemory 実装
 * - それ以外で引数省略時は env から自動取得
 */
export function createUserRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): UserRepository {
  return userRegistry.user.createRepository(docClient, tableName);
}

/**
 * 内部のシングルトンインスタンスを破棄する。テスト用。
 */
export function resetUserRepository(): void {
  userRegistry.resetAll();
}
