import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';
import { dynamoDb, USERS_TABLE_NAME } from '@/lib/db/dynamodb-client';
import type { User } from '@/lib/db/types';

// Mock AWS SDK
jest.mock('@/lib/db/dynamodb-client', () => ({
  dynamoDb: {
    send: jest.fn(),
  },
  USERS_TABLE_NAME: 'test-users-table',
}));

// Mock crypto.randomUUID
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-12345'),
}));

describe('DynamoDBUserRepository', () => {
  let repository: DynamoDBUserRepository;
  const mockSend = dynamoDb.send as jest.MockedFunction<(command: unknown) => Promise<unknown>>;

  beforeEach(() => {
    repository = new DynamoDBUserRepository();
    mockSend.mockClear();
  });

  describe('getUserByGoogleId', () => {
    it('Google ID が存在する場合はユーザーを返す', async () => {
      const mockUser: User = {
        userId: 'user-123',
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'テストユーザー',
        roles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockSend.mockResolvedValueOnce({
        Items: [mockUser],
        $metadata: {},
      });

      const result = await repository.getUserByGoogleId('google-123');

      expect(result).toEqual(mockUser);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: USERS_TABLE_NAME,
            IndexName: 'googleId-index',
            KeyConditionExpression: 'googleId = :googleId',
            ExpressionAttributeValues: {
              ':googleId': 'google-123',
            },
          }),
        })
      );
    });

    it('Google ID が存在しない場合は null を返す', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      const result = await repository.getUserByGoogleId('nonexistent');

      expect(result).toBeNull();
    });

    it('Items が undefined の場合は null を返す', async () => {
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getUserByGoogleId('google-123');

      expect(result).toBeNull();
    });
  });

  describe('getUserById', () => {
    it('ユーザー ID が存在する場合はユーザーを返す', async () => {
      const mockUser: User = {
        userId: 'user-123',
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'テストユーザー',
        roles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockSend.mockResolvedValueOnce({
        Item: mockUser,
        $metadata: {},
      });

      const result = await repository.getUserById('user-123');

      expect(result).toEqual(mockUser);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: USERS_TABLE_NAME,
            Key: { userId: 'user-123' },
          }),
        })
      );
    });

    it('ユーザー ID が存在しない場合は null を返す', async () => {
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listUsers', () => {
    it('ユーザー一覧を返す', async () => {
      const mockUsers: User[] = [
        {
          userId: 'user-1',
          googleId: 'google-1',
          email: 'user1@example.com',
          name: 'ユーザー1',
          roles: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          userId: 'user-2',
          googleId: 'google-2',
          email: 'user2@example.com',
          name: 'ユーザー2',
          roles: ['admin'],
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockUsers,
        $metadata: {},
      });

      const result = await repository.listUsers();

      expect(result.users).toEqual(mockUsers);
      expect(result.lastEvaluatedKey).toBeUndefined();
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: USERS_TABLE_NAME,
            Limit: 100,
          }),
        })
      );
    });

    it('ページネーションパラメータを正しく渡す', async () => {
      const lastKey = { userId: 'user-50' };
      mockSend.mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: lastKey,
        $metadata: {},
      });

      const result = await repository.listUsers(50, lastKey);

      expect(result.lastEvaluatedKey).toEqual(lastKey);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Limit: 50,
            ExclusiveStartKey: lastKey,
          }),
        })
      );
    });

    it('Items が undefined の場合は空配列を返す', async () => {
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.listUsers();

      expect(result.users).toEqual([]);
    });
  });

  describe('upsertUser', () => {
    beforeEach(() => {
      // Mock Date.now() for consistent timestamps
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-15T12:00:00.000Z');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('新規ユーザーを作成する', async () => {
      // getUserByGoogleId returns null (user doesn't exist)
      mockSend.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      // PutCommand succeeds
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      const input = {
        googleId: 'google-new',
        email: 'new@example.com',
        name: '新規ユーザー',
        picture: 'https://example.com/pic.jpg',
      };

      const result = await repository.upsertUser(input);

      expect(result).toEqual({
        userId: 'test-uuid-12345',
        googleId: 'google-new',
        email: 'new@example.com',
        name: '新規ユーザー',
        picture: 'https://example.com/pic.jpg',
        roles: [],
        createdAt: '2024-01-15T12:00:00.000Z',
        updatedAt: '2024-01-15T12:00:00.000Z',
      });

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: USERS_TABLE_NAME,
            Item: expect.objectContaining({
              userId: 'test-uuid-12345',
              googleId: 'google-new',
              email: 'new@example.com',
              roles: [],
            }),
          }),
        })
      );
    });

    it('既存ユーザーを更新する', async () => {
      const existingUser: User = {
        userId: 'user-existing',
        googleId: 'google-existing',
        email: 'old@example.com',
        name: '古い名前',
        roles: ['admin'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      // getUserByGoogleId returns existing user
      mockSend.mockResolvedValueOnce({
        Items: [existingUser],
        $metadata: {},
      });

      // PutCommand succeeds
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      const input = {
        googleId: 'google-existing',
        email: 'new@example.com',
        name: '新しい名前',
        picture: 'https://example.com/new.jpg',
      };

      const result = await repository.upsertUser(input);

      expect(result).toEqual({
        userId: 'user-existing',
        googleId: 'google-existing',
        email: 'old@example.com', // Email should not be updated
        name: '新しい名前',
        picture: 'https://example.com/new.jpg',
        roles: ['admin'], // Roles should be preserved
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-15T12:00:00.000Z',
      });

      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateUser', () => {
    beforeEach(() => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-15T12:00:00.000Z');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('ユーザー情報を更新する', async () => {
      const existingUser: User = {
        userId: 'user-123',
        googleId: 'google-123',
        email: 'test@example.com',
        name: '古い名前',
        roles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      // getUserById returns existing user
      mockSend.mockResolvedValueOnce({
        Item: existingUser,
        $metadata: {},
      });

      // PutCommand succeeds
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.updateUser('user-123', {
        name: '新しい名前',
        roles: ['admin'],
      });

      expect(result).toEqual({
        ...existingUser,
        name: '新しい名前',
        roles: ['admin'],
        updatedAt: '2024-01-15T12:00:00.000Z',
      });

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('ユーザーが存在しない場合はエラーを投げる', async () => {
      // getUserById returns null
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      await expect(repository.updateUser('nonexistent', { name: '新しい名前' })).rejects.toThrow(
        'ユーザーが見つかりません: nonexistent'
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteUser', () => {
    it('ユーザーを削除する', async () => {
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.deleteUser('user-123');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: USERS_TABLE_NAME,
            Key: { userId: 'user-123' },
          }),
        })
      );
    });
  });

  describe('assignRoles', () => {
    beforeEach(() => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-15T12:00:00.000Z');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('ユーザーにロールを割り当てる', async () => {
      const existingUser: User = {
        userId: 'user-123',
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'テストユーザー',
        roles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      // getUserById returns existing user
      mockSend.mockResolvedValueOnce({
        Item: existingUser,
        $metadata: {},
      });

      // PutCommand succeeds
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.assignRoles('user-123', ['admin', 'user-manager']);

      expect(result.roles).toEqual(['admin', 'user-manager']);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateLastLogin', () => {
    beforeEach(() => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-15T12:00:00.000Z');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('最終ログイン日時を更新する', async () => {
      const existingUser: User = {
        userId: 'user-123',
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'テストユーザー',
        roles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      // getUserById returns existing user
      mockSend.mockResolvedValueOnce({
        Item: existingUser,
        $metadata: {},
      });

      // PutCommand succeeds
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.updateLastLogin('user-123');

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              lastLoginAt: '2024-01-15T12:00:00.000Z',
              updatedAt: '2024-01-15T12:00:00.000Z',
            }),
          }),
        })
      );
    });

    it('ユーザーが存在しない場合はエラーを投げる', async () => {
      // getUserById returns null
      mockSend.mockResolvedValueOnce({
        $metadata: {},
      });

      await expect(repository.updateLastLogin('nonexistent')).rejects.toThrow(
        'ユーザーが見つかりません: nonexistent'
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
