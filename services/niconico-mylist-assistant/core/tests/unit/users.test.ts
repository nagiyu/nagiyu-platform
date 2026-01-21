// テスト実行前にTABLE_NAMEを設定
process.env.TABLE_NAME = 'test-table';

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createUser, getUser } from '../../src/db/users';
import type { User } from '../../src/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('users', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('createUser', () => {
    it('ユーザーを新規作成できる', async () => {
      ddbMock.on(PutCommand).resolves({});

      const user: User = {
        userId: 'user123',
        email: 'test@example.com',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      await createUser(user);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: 'test-table',
        Item: {
          PK: 'USER#user123',
          SK: 'METADATA',
          GSI1PK: 'USER',
          GSI1SK: 'user123',
          userId: 'user123',
          email: 'test@example.com',
        },
      });
    });
  });

  describe('getUser', () => {
    it('ユーザーを取得できる', async () => {
      const mockItem = {
        PK: 'USER#user123',
        SK: 'METADATA',
        GSI1PK: 'USER',
        GSI1SK: 'user123',
        userId: 'user123',
        email: 'test@example.com',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockItem });

      const user = await getUser('user123');

      expect(user).not.toBeNull();
      expect(user?.userId).toBe('user123');
      expect(user?.email).toBe('test@example.com');
      expect(user).not.toHaveProperty('PK');
      expect(user).not.toHaveProperty('SK');
    });

    it('存在しないユーザーはnullを返す', async () => {
      ddbMock.on(GetCommand).resolves({});

      const user = await getUser('nonexistent');

      expect(user).toBeNull();
    });
  });
});
