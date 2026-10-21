import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  DatabaseError,
  EntityNotFoundError,
  getDynamoDBDocumentClient,
  getTableName,
} from '@nagiyu/aws';
import { DynamoDBUserRepository } from '../../../src/repositories/dynamodb-user-repository';

const USERS_TABLE_NAME = 'test-users-table';
const NOW = 1706745600000;

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  getDynamoDBDocumentClient: jest.fn(),
  getTableName: jest.fn(),
}));

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-12345'),
}));

function buildStoredUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: 'user-123',
    googleId: 'google-123',
    Type: 'User',
    Email: 'test@example.com',
    Name: 'テストユーザー',
    Roles: [],
    CreatedAt: NOW,
    UpdatedAt: NOW,
    ...overrides,
  };
}

function conditionalCheckFailed(): Error {
  return Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
}

describe('DynamoDBUserRepository', () => {
  let repository: DynamoDBUserRepository;
  let mockSend: jest.MockedFunction<(command: unknown) => Promise<unknown>>;

  beforeEach(() => {
    mockSend = jest.fn();
    repository = new DynamoDBUserRepository(
      { send: mockSend } as unknown as DynamoDBDocumentClient,
      USERS_TABLE_NAME
    );
  });

  describe('コンストラクタ', () => {
    it('引数を省略すると共通クライアントとテーブル名を使う', () => {
      (getDynamoDBDocumentClient as jest.Mock).mockReturnValue({ send: mockSend });
      (getTableName as jest.Mock).mockReturnValue('resolved-table');
      mockSend.mockResolvedValueOnce({});

      const defaultRepository = new DynamoDBUserRepository();
      void defaultRepository.getUserById('user-123');

      expect(getTableName).toHaveBeenCalledWith('nagiyu-auth-users-dev');
      expect(mockSend.mock.calls[0][0]).toBeInstanceOf(GetCommand);
      expect((mockSend.mock.calls[0][0] as GetCommand).input.TableName).toBe('resolved-table');
    });
  });

  describe('getUserByGoogleId', () => {
    it('GSI を Query して Entity に変換する', async () => {
      mockSend.mockResolvedValueOnce({ Items: [buildStoredUser()] });

      const result = await repository.getUserByGoogleId('google-123');

      expect(result).toEqual({
        userId: 'user-123',
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'テストユーザー',
        roles: [],
        createdAt: NOW,
        updatedAt: NOW,
      });
      const command = mockSend.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: USERS_TABLE_NAME,
        IndexName: 'googleId-index',
        KeyConditionExpression: 'googleId = :googleId',
        ExpressionAttributeValues: { ':googleId': 'google-123' },
      });
    });

    it('該当がなければ null を返す', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      expect(await repository.getUserByGoogleId('google-none')).toBeNull();
    });

    it('Items がなくても null を返す', async () => {
      mockSend.mockResolvedValueOnce({});

      expect(await repository.getUserByGoogleId('google-none')).toBeNull();
    });

    it('DynamoDB のエラーは DatabaseError にする', async () => {
      mockSend.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.getUserByGoogleId('google-123')).rejects.toBeInstanceOf(
        DatabaseError
      );
    });
  });

  describe('getUserById', () => {
    it('GetItem の結果を Entity に変換する', async () => {
      mockSend.mockResolvedValueOnce({
        Item: buildStoredUser({ Picture: 'https://example.com/a.png' }),
      });

      const result = await repository.getUserById('user-123');

      expect(result?.picture).toBe('https://example.com/a.png');
      const command = mockSend.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ userId: 'user-123' });
    });

    it('存在しなければ null を返す', async () => {
      mockSend.mockResolvedValueOnce({});

      expect(await repository.getUserById('none')).toBeNull();
    });
  });

  describe('listUsers', () => {
    it('Scan の結果を Entity に変換し、LastEvaluatedKey を返す', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [buildStoredUser(), buildStoredUser({ userId: 'user-456', googleId: 'g-456' })],
        LastEvaluatedKey: { userId: 'user-456' },
      });

      const result = await repository.listUsers(2, { userId: 'user-000' });

      expect(result.users.map((user) => user.userId)).toEqual(['user-123', 'user-456']);
      expect(result.lastEvaluatedKey).toEqual({ userId: 'user-456' });
      const command = mockSend.mock.calls[0][0] as ScanCommand;
      expect(command).toBeInstanceOf(ScanCommand);
      expect(command.input).toMatchObject({
        TableName: USERS_TABLE_NAME,
        Limit: 2,
        ExclusiveStartKey: { userId: 'user-000' },
      });
    });

    it('引数を省略すると limit は 100 になり、最終ページでは lastEvaluatedKey がない', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await repository.listUsers();

      expect(result).toEqual({ users: [], lastEvaluatedKey: undefined });
      expect((mockSend.mock.calls[0][0] as ScanCommand).input.Limit).toBe(100);
    });

    it('DynamoDB のエラーは DatabaseError にする', async () => {
      mockSend.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.listUsers()).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('upsertUser', () => {
    it('既存ユーザーがいなければ roles 空で作成する', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }).mockResolvedValueOnce({});

      const result = await repository.upsertUser({
        googleId: 'google-new',
        email: 'new@example.com',
        name: '新規',
        picture: 'https://example.com/new.png',
      });

      expect(result).toMatchObject({
        userId: 'test-uuid-12345',
        googleId: 'google-new',
        email: 'new@example.com',
        name: '新規',
        picture: 'https://example.com/new.png',
        roles: [],
      });
      const command = mockSend.mock.calls[1][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input.Item).toMatchObject({
        userId: 'test-uuid-12345',
        Type: 'User',
        Email: 'new@example.com',
        Picture: 'https://example.com/new.png',
      });
    });

    it('picture がなければ picture を持たない状態で作成する', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }).mockResolvedValueOnce({});

      const result = await repository.upsertUser({
        googleId: 'google-new',
        email: 'new@example.com',
        name: '新規',
      });

      expect(result).not.toHaveProperty('picture');
    });

    it('既存ユーザーがいれば name を更新し、picture がなければ picture を削除する', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [buildStoredUser({ Picture: 'https://example.com/old.png' })],
        })
        .mockResolvedValueOnce({ Attributes: buildStoredUser({ Name: '更新後' }) });

      const result = await repository.upsertUser({
        googleId: 'google-123',
        email: 'test@example.com',
        name: '更新後',
      });

      expect(result.name).toBe('更新後');
      const command = mockSend.mock.calls[1][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ userId: 'user-123' });
      expect(command.input.UpdateExpression).toMatch(/^SET .*REMOVE /);
      expect(Object.values(command.input.ExpressionAttributeNames ?? {})).toEqual(
        expect.arrayContaining(['Name', 'Picture', 'picture', 'name'])
      );
    });
  });

  describe('updateUser / assignRoles / updateLastLogin', () => {
    it('updateUser は UpdateItem で更新後の Entity を返す', async () => {
      mockSend.mockResolvedValueOnce({ Attributes: buildStoredUser({ Name: '変更後' }) });

      const result = await repository.updateUser('user-123', { name: '変更後' });

      expect(result.name).toBe('変更後');
      expect(mockSend.mock.calls[0][0]).toBeInstanceOf(UpdateCommand);
    });

    it('assignRoles はロールを更新する', async () => {
      mockSend.mockResolvedValueOnce({ Attributes: buildStoredUser({ Roles: ['admin'] }) });

      const result = await repository.assignRoles('user-123', ['admin']);

      expect(result.roles).toEqual(['admin']);
      const command = mockSend.mock.calls[0][0] as UpdateCommand;
      expect(Object.values(command.input.ExpressionAttributeValues ?? {})).toContainEqual([
        'admin',
      ]);
    });

    it('updateLastLogin は LastLoginAt を数値ミリ秒で書く', async () => {
      mockSend.mockResolvedValueOnce({ Attributes: buildStoredUser({ LastLoginAt: NOW }) });
      const before = Date.now();

      await repository.updateLastLogin('user-123');

      const command = mockSend.mock.calls[0][0] as UpdateCommand;
      const written = Object.values(command.input.ExpressionAttributeValues ?? {}).filter(
        (value): value is number => typeof value === 'number'
      );
      expect(written.length).toBeGreaterThan(0);
      expect(written.every((value) => value >= before)).toBe(true);
    });

    it.each([
      ['updateUser', (repo: DynamoDBUserRepository) => repo.updateUser('none', { name: 'x' })],
      ['assignRoles', (repo: DynamoDBUserRepository) => repo.assignRoles('none', [])],
      ['updateLastLogin', (repo: DynamoDBUserRepository) => repo.updateLastLogin('none')],
    ])('%s は対象がいなければ EntityNotFoundError になる', async (_name, action) => {
      mockSend.mockRejectedValueOnce(conditionalCheckFailed());

      await expect(action(repository)).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });

  describe('deleteUser', () => {
    it('存在を条件に DeleteItem する', async () => {
      mockSend.mockResolvedValueOnce({});

      await repository.deleteUser('user-123');

      const command = mockSend.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ userId: 'user-123' });
      expect(command.input.ConditionExpression).toBeDefined();
    });

    it('対象がいなければ EntityNotFoundError になる', async () => {
      mockSend.mockRejectedValueOnce(conditionalCheckFailed());

      await expect(repository.deleteUser('none')).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });
});
