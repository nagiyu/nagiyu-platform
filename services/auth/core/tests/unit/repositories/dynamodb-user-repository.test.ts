import {
  DynamoDBUserRepository,
  UserNotFoundError,
} from '../../../src/repositories/dynamodb-user-repository';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { User } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';

const USERS_TABLE_NAME = 'test-users-table';

// Mock @nagiyu/aws to test default constructor parameter fallback
jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(),
  getTableName: jest.fn(),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

// Mock crypto.randomUUID
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-12345'),
}));

describe('DynamoDBUserRepository', () => {
  let repository: DynamoDBUserRepository;
  let mockSend: jest.MockedFunction<(command: unknown) => Promise<unknown>>;

  beforeEach(() => {
    mockSend = jest.fn();
    const mockDynamoDb = { send: mockSend } as unknown as DynamoDBDocumentClient;
    repository = new DynamoDBUserRepository(mockDynamoDb, USERS_TABLE_NAME);
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

    it('DynamoDB エラー時は reportErrorEvent を呼び再スローする', async () => {
      const dbError = new Error('DynamoDB connection failed');
      mockSend.mockRejectedValueOnce(dbError);

      await expect(repository.getUserByGoogleId('google-123')).rejects.toThrow(dbError);

      expect(reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'auth',
          severity: 'error',
          title: 'DB: getUserByGoogleId エラー',
          message: 'DynamoDB connection failed',
        })
      );
      const call = (reportErrorEvent as jest.Mock).mock.calls[0][0];
      expect(JSON.stringify(call.context)).not.toContain('google-123');
    });

    it('Error インスタンス以外の例外でも reportErrorEvent を呼び再スローする', async () => {
      const stringError = 'unexpected string error';
      mockSend.mockRejectedValueOnce(stringError);

      await expect(repository.getUserByGoogleId('google-123')).rejects.toBe(stringError);

      expect(reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'auth',
          severity: 'error',
          message: 'unexpected string error',
          context: expect.objectContaining({ errorStack: undefined }),
        })
      );
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

    it('新規ユーザー作成時に DynamoDB エラーが発生した場合は reportErrorEvent を呼び再スローする', async () => {
      const dbError = new Error('DynamoDB put failed');

      // getUserByGoogleId returns null (new user)
      mockSend.mockResolvedValueOnce({ Items: [], $metadata: {} });
      // PutCommand fails
      mockSend.mockRejectedValueOnce(dbError);

      await expect(
        repository.upsertUser({ googleId: 'google-new', email: 'new@example.com', name: '新規' })
      ).rejects.toThrow(dbError);

      expect(reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'auth',
          severity: 'error',
          title: 'DB: upsertUser (新規ユーザー作成) エラー',
          message: 'DynamoDB put failed',
        })
      );
      const call = (reportErrorEvent as jest.Mock).mock.calls[0][0];
      expect(JSON.stringify(call.context)).not.toContain('google-new');
      expect(JSON.stringify(call.context)).not.toContain('@example.com');
    });

    it('新規ユーザー作成時に Error 以外の例外でも reportErrorEvent を呼ぶ', async () => {
      mockSend.mockResolvedValueOnce({ Items: [], $metadata: {} });
      mockSend.mockRejectedValueOnce('db string error');

      await expect(
        repository.upsertUser({ googleId: 'g', email: 'e@example.com', name: 'N' })
      ).rejects.toBe('db string error');

      expect(reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'db string error',
          context: expect.objectContaining({ errorStack: undefined }),
        })
      );
    });

    it('既存ユーザー更新時に DynamoDB エラーが発生した場合は reportErrorEvent を userId 付きで呼ぶ', async () => {
      const existingUser: User = {
        userId: 'user-existing',
        googleId: 'google-existing',
        email: 'old@example.com',
        name: '古い名前',
        roles: ['admin'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const dbError = new Error('DynamoDB put failed');

      // getUserByGoogleId returns existing user
      mockSend.mockResolvedValueOnce({ Items: [existingUser], $metadata: {} });
      // PutCommand fails
      mockSend.mockRejectedValueOnce(dbError);

      await expect(
        repository.upsertUser({
          googleId: 'google-existing',
          email: 'old@example.com',
          name: '新しい名前',
        })
      ).rejects.toThrow(dbError);

      expect(reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'auth',
          severity: 'error',
          title: 'DB: upsertUser (既存ユーザー更新) エラー',
          context: expect.objectContaining({ userId: 'user-existing' }),
        })
      );
      const call = (reportErrorEvent as jest.Mock).mock.calls[0][0];
      expect(JSON.stringify(call.context)).not.toContain('google-existing');
      expect(JSON.stringify(call.context)).not.toContain('@example.com');
    });

    it('既存ユーザー更新時に Error 以外の例外でも reportErrorEvent を呼ぶ', async () => {
      const existingUser: User = {
        userId: 'user-existing',
        googleId: 'google-existing',
        email: 'old@example.com',
        name: '古い名前',
        roles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      mockSend.mockResolvedValueOnce({ Items: [existingUser], $metadata: {} });
      mockSend.mockRejectedValueOnce('db string error');

      await expect(
        repository.upsertUser({
          googleId: 'google-existing',
          email: 'old@example.com',
          name: '名前',
        })
      ).rejects.toBe('db string error');

      expect(reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ errorStack: undefined, userId: 'user-existing' }),
        })
      );
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
        UserNotFoundError
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

      await expect(repository.updateLastLogin('nonexistent')).rejects.toThrow(UserNotFoundError);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('コンストラクタのデフォルト引数', () => {
    it('引数なしで生成した場合、getDynamoDBDocumentClient と getTableName が呼び出される', () => {
      const mockDefaultSend = jest.fn();
      const mockDefaultDynamoDb = { send: mockDefaultSend } as unknown as DynamoDBDocumentClient;
      (getDynamoDBDocumentClient as jest.Mock).mockReturnValue(mockDefaultDynamoDb);
      (getTableName as jest.Mock).mockReturnValue('default-table');

      const defaultRepo = new DynamoDBUserRepository();

      expect(getDynamoDBDocumentClient).toHaveBeenCalledWith();
      expect(getTableName).toHaveBeenCalledWith('nagiyu-auth-users-dev');
      expect(defaultRepo).toBeInstanceOf(DynamoDBUserRepository);
    });
  });
});
