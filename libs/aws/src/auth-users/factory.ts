/**
 * AuthUserRoleSourceReader Factory
 *
 * 環境変数 `USE_IN_MEMORY_DB` に応じて in-memory / DynamoDB の実装を切り替える。
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { registerDynamoRepositories } from '../dynamodb/repository-registry.js';
import type { InMemorySingleTableStore } from '../dynamodb/in-memory/single-table-store.js';
import { DynamoDBAuthUserRoleSourceReader } from './dynamodb-reader.js';
import { InMemoryAuthUserRoleSourceReader } from './in-memory-reader.js';
import { getInMemoryAuthUserStore, resetInMemoryAuthUserStore } from './in-memory-store.js';
import type { AuthUserRoleSourceReader } from './reader.js';

const authUserRegistry = registerDynamoRepositories<
  { roleSourceReader: AuthUserRoleSourceReader },
  InMemorySingleTableStore
>(
  {
    roleSourceReader: {
      createInMemoryRepository: (store) => new InMemoryAuthUserRoleSourceReader(store),
      createDynamoDBRepository: ({ docClient, tableName }) =>
        new DynamoDBAuthUserRoleSourceReader(docClient, tableName),
    },
  },
  { keyPrefix: 'auth-users', createSharedStore: getInMemoryAuthUserStore }
);

/**
 * `AuthUserRoleSourceReader` を生成する。
 *
 * テーブル名は呼び出し元サービス自身のテーブルとは別 (auth のユーザーテーブル) なので、
 * 環境変数の既定値に頼らず必ず受け取る。
 *
 * - `USE_IN_MEMORY_DB=true` のとき in-memory 実装 (共有ストアを読む)
 * - それ以外は DynamoDB 実装。`docClient` 省略時は env から解決する
 *
 * 一度生成されたインスタンスはシングルトンとして再利用される。
 *
 * @param tableName - auth のユーザーテーブル名 (`nagiyu-auth-users-{env}`)
 * @param docClient - DynamoDB クライアント。省略時は env から解決する
 */
export function createAuthUserRoleSourceReader(
  tableName: string,
  docClient?: DynamoDBDocumentClient
): AuthUserRoleSourceReader {
  return authUserRegistry.roleSourceReader.createRepository(docClient, tableName);
}

/**
 * Reader のインスタンスと InMemory の共有ストアを破棄する。テスト用。
 */
export function resetAuthUserRoleSourceReader(): void {
  authUserRegistry.resetAll();
  resetInMemoryAuthUserStore();
}
