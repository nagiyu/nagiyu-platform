import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { UserRepository, IDynamoDBClientFactory, User } from '@/lib/repositories/UserRepository';

const ddbMock = mockClient(DynamoDBDocumentClient);

class MockDynamoDBClientFactory implements IDynamoDBClientFactory {
  createClient() {
    return ddbMock as unknown as DynamoDBDocumentClient;
  }
}

describe('UserRepository', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('getUserById', () => {
    test('should return user when found', async () => {
      const mockUser: User = {
        userId: 'user_123',
        googleId: 'google_123',
        email: 'test@example.com',
        name: 'Test User',
        roles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockUser,
      });

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const user = await repo.getUserById('user_123');

      expect(user).toEqual(mockUser);
    });

    test('should return null when user not found', async () => {
      ddbMock.on(GetCommand).resolves({});

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const user = await repo.getUserById('nonexistent');

      expect(user).toBeNull();
    });

    test('should throw error on DynamoDB failure', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');

      await expect(repo.getUserById('user_123')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('getUserByGoogleId', () => {
    test('should return user when found', async () => {
      const mockUser: User = {
        userId: 'user_123',
        googleId: 'google_123',
        email: 'test@example.com',
        name: 'Test User',
        roles: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [mockUser],
      });

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const user = await repo.getUserByGoogleId('google_123');

      expect(user?.googleId).toBe('google_123');
      expect(user?.email).toBe('test@example.com');
    });

    test('should return null when user not found', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const user = await repo.getUserByGoogleId('nonexistent');

      expect(user).toBeNull();
    });

    test('should throw error on DynamoDB failure', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');

      await expect(repo.getUserByGoogleId('google_123')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('upsertUser', () => {
    test('should create new user when not exists', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(PutCommand).resolves({});

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const user = await repo.upsertUser({
        googleId: 'google_new',
        email: 'new@example.com',
        name: 'New User',
      });

      expect(user.googleId).toBe('google_new');
      expect(user.email).toBe('new@example.com');
      expect(user.name).toBe('New User');
      expect(user.roles).toEqual([]);
      expect(user.userId).toMatch(/^user_/);
    });

    test('should create new user with picture', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(PutCommand).resolves({});

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const user = await repo.upsertUser({
        googleId: 'google_new',
        email: 'new@example.com',
        name: 'New User',
        picture: 'https://example.com/avatar.jpg',
      });

      expect(user.picture).toBe('https://example.com/avatar.jpg');
    });

    test('should update existing user', async () => {
      const existingUser: User = {
        userId: 'user_123',
        googleId: 'google_123',
        email: 'test@example.com',
        name: 'Old Name',
        roles: ['admin'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(QueryCommand).resolves({
        Items: [existingUser],
      });
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          ...existingUser,
          name: 'Updated Name',
          picture: 'https://example.com/new-avatar.jpg',
          updatedAt: '2024-01-02T00:00:00.000Z',
          lastLoginAt: '2024-01-02T00:00:00.000Z',
        },
      });

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const user = await repo.upsertUser({
        googleId: 'google_123',
        email: 'test@example.com',
        name: 'Updated Name',
        picture: 'https://example.com/new-avatar.jpg',
      });

      expect(user.name).toBe('Updated Name');
      expect(user.picture).toBe('https://example.com/new-avatar.jpg');
    });

    test('should throw error on DynamoDB failure', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');

      await expect(
        repo.upsertUser({
          googleId: 'google_123',
          email: 'test@example.com',
          name: 'Test User',
        })
      ).rejects.toThrow('DynamoDB error');
    });
  });

  describe('updateUser', () => {
    test('should update user name', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          userId: 'user_123',
          googleId: 'google_123',
          email: 'test@example.com',
          name: 'Updated Name',
          roles: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      });

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const user = await repo.updateUser('user_123', {
        name: 'Updated Name',
      });

      expect(user.name).toBe('Updated Name');
    });

    test('should update user roles', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          userId: 'user_123',
          googleId: 'google_123',
          email: 'test@example.com',
          name: 'Test User',
          roles: ['admin', 'user-manager'],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      });

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const user = await repo.updateUser('user_123', {
        roles: ['admin', 'user-manager'],
      });

      expect(user.roles).toEqual(['admin', 'user-manager']);
    });

    test('should throw error on DynamoDB failure', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('DynamoDB error'));

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');

      await expect(repo.updateUser('user_123', { name: 'New Name' })).rejects.toThrow(
        'DynamoDB error'
      );
    });
  });

  describe('deleteUser', () => {
    test('should delete user successfully', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      await repo.deleteUser('user_123');

      // Should not throw
      expect(true).toBe(true);
    });

    test('should throw error on DynamoDB failure', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');

      await expect(repo.deleteUser('user_123')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('listUsers', () => {
    test('should return list of users', async () => {
      const mockUsers: User[] = [
        {
          userId: 'user_1',
          googleId: 'google_1',
          email: 'user1@example.com',
          name: 'User 1',
          roles: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          userId: 'user_2',
          googleId: 'google_2',
          email: 'user2@example.com',
          name: 'User 2',
          roles: ['admin'],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(ScanCommand).resolves({
        Items: mockUsers,
      });

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const users = await repo.listUsers();

      expect(users).toHaveLength(2);
      expect(users[0].userId).toBe('user_1');
      expect(users[1].userId).toBe('user_2');
    });

    test('should return empty array when no users', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [],
      });

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');
      const users = await repo.listUsers();

      expect(users).toEqual([]);
    });

    test('should throw error on DynamoDB failure', async () => {
      ddbMock.on(ScanCommand).rejects(new Error('DynamoDB error'));

      const repo = new UserRepository(new MockDynamoDBClientFactory(), 'test-table');

      await expect(repo.listUsers()).rejects.toThrow('DynamoDB error');
    });
  });
});
