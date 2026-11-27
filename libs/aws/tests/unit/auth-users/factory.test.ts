/**
 * AuthUserRoleSourceReader factory の単体テスト
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBAuthUserRoleSourceReader } from '../../../src/auth-users/dynamodb-reader.js';
import {
  createAuthUserRoleSourceReader,
  resetAuthUserRoleSourceReader,
} from '../../../src/auth-users/factory.js';
import { InMemoryAuthUserRoleSourceReader } from '../../../src/auth-users/in-memory-reader.js';
import { getInMemoryAuthUserStore } from '../../../src/auth-users/in-memory-store.js';

describe('createAuthUserRoleSourceReader', () => {
  const original = process.env.USE_IN_MEMORY_DB;

  afterEach(() => {
    resetAuthUserRoleSourceReader();
    if (original === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
    } else {
      process.env.USE_IN_MEMORY_DB = original;
    }
  });

  it('USE_IN_MEMORY_DB=true なら共有ストアを読む in-memory 版を返す', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    getInMemoryAuthUserStore().putByKey({ userId: 'u1' }, { userId: 'u1', Roles: ['admin'] });

    const reader = createAuthUserRoleSourceReader('nagiyu-auth-users-dev');

    expect(reader).toBeInstanceOf(InMemoryAuthUserRoleSourceReader);
    await expect(reader.getRoleSources('u1')).resolves.toEqual({
      roles: ['admin'],
      roleGrants: [],
    });
  });

  it('それ以外は渡したテーブル名の DynamoDB 版を返し、同じインスタンスを再利用する', async () => {
    process.env.USE_IN_MEMORY_DB = 'false';
    const send = jest.fn().mockResolvedValue({ Item: { Roles: [] } });
    const docClient = { send } as unknown as DynamoDBDocumentClient;

    const reader = createAuthUserRoleSourceReader('nagiyu-auth-users-dev', docClient);
    await reader.getRoleSources('u1');

    expect(reader).toBeInstanceOf(DynamoDBAuthUserRoleSourceReader);
    expect(send.mock.calls[0][0].input.TableName).toBe('nagiyu-auth-users-dev');
    expect(createAuthUserRoleSourceReader('nagiyu-auth-users-dev', docClient)).toBe(reader);
  });
});
