/**
 * DynamoDBAuthUserRoleSourceReader の単体テスト
 */

import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBAuthUserRoleSourceReader } from '../../../src/auth-users/dynamodb-reader.js';
import { DatabaseError } from '../../../src/dynamodb/errors.js';

const GRANT_ITEM = {
  grantId: 'g1',
  roleId: 'livetalk-plus',
  source: 'stripe',
  createdAt: 1704067200000,
  updatedAt: 1706745600000,
};

describe('DynamoDBAuthUserRoleSourceReader', () => {
  let send: jest.Mock;
  let reader: DynamoDBAuthUserRoleSourceReader;

  beforeEach(() => {
    send = jest.fn();
    reader = new DynamoDBAuthUserRoleSourceReader(
      { send } as unknown as DynamoDBDocumentClient,
      'nagiyu-auth-users-dev'
    );
  });

  it('ロールに要る属性だけを ProjectionExpression で読む', async () => {
    send.mockResolvedValueOnce({ Item: { Roles: [] } });

    await reader.getRoleSources('user-1');

    const command = send.mock.calls[0][0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input.TableName).toBe('nagiyu-auth-users-dev');
    expect(command.input.Key).toEqual({ userId: 'user-1' });
    const names = Object.values(command.input.ExpressionAttributeNames ?? {});
    expect(names.sort()).toEqual(['RoleGrants', 'Roles', 'roles']);
    const projection = command.input.ProjectionExpression ?? '';
    expect(projection).toBe('#Roles, #roles, #RoleGrants');
    for (const personal of ['Email', 'Name', 'Picture', 'email', 'name', 'picture']) {
      expect(projection).not.toContain(personal);
      expect(names).not.toContain(personal);
    }
  });

  it('ロールと権利を返す', async () => {
    send.mockResolvedValueOnce({ Item: { Roles: ['admin'], RoleGrants: [GRANT_ITEM] } });

    const result = await reader.getRoleSources('user-1');

    expect(result).toEqual({ roles: ['admin'], roleGrants: [GRANT_ITEM] });
  });

  it('旧名 roles の項目を読める', async () => {
    send.mockResolvedValueOnce({ Item: { roles: ['legacy-admin'] } });

    const result = await reader.getRoleSources('user-1');

    expect(result?.roles).toEqual(['legacy-admin']);
  });

  it('権利の属性がなければ空配列を返す', async () => {
    send.mockResolvedValueOnce({ Item: { Roles: [] } });

    const result = await reader.getRoleSources('user-1');

    expect(result).toEqual({ roles: [], roleGrants: [] });
  });

  it('ユーザーがいなければ null を返す', async () => {
    send.mockResolvedValueOnce({});

    await expect(reader.getRoleSources('missing')).resolves.toBeNull();
  });

  it('DynamoDB のエラーを DatabaseError で包む', async () => {
    send.mockRejectedValueOnce(new Error('boom'));

    await expect(reader.getRoleSources('user-1')).rejects.toBeInstanceOf(DatabaseError);
  });

  it('保存データが読めないときも RepositoryError のまま伝える', async () => {
    send.mockResolvedValueOnce({ Item: { Roles: 'broken' } });

    await expect(reader.getRoleSources('user-1')).rejects.toThrow();
  });
});
