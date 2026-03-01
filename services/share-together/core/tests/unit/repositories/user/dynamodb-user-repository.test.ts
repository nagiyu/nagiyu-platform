import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBUserRepository } from '../../../../src/repositories/user/dynamodb-user-repository.js';

describe('DynamoDBUserRepository', () => {
  const TABLE_NAME = 'test-share-together-main';
  let repository: DynamoDBUserRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    mockDocClient = {
      send: jest.fn(),
    };

    repository = new DynamoDBUserRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getById', () => {
    it('ユーザーIDでユーザーを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-1',
          SK: '#META#',
          GSI2PK: 'EMAIL#test@example.com',
          userId: 'user-1',
          email: 'test@example.com',
          name: 'テストユーザー',
          image: 'https://example.com/image.png',
          defaultListId: 'list-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const result = await repository.getById('user-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as GetCommand;

      expect(result).toEqual({
        userId: 'user-1',
        email: 'test@example.com',
        name: 'テストユーザー',
        image: 'https://example.com/image.png',
        defaultListId: 'list-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'USER#user-1',
          SK: '#META#',
        },
      });
    });

    it('ユーザーが存在しない場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('user-404');

      expect(result).toBeNull();
    });
  });

  describe('getByEmail', () => {
    it('メールアドレスでユーザーを取得できる（GSI2）', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-1',
            SK: '#META#',
            GSI2PK: 'EMAIL#test@example.com',
            userId: 'user-1',
            email: 'test@example.com',
            name: 'テストユーザー',
            defaultListId: 'list-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const result = await repository.getByEmail('test@example.com');
      const command = mockDocClient.send.mock.calls[0]?.[0] as QueryCommand;

      expect(result).toEqual({
        userId: 'user-1',
        email: 'test@example.com',
        name: 'テストユーザー',
        image: undefined,
        defaultListId: 'list-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: '#gsi2pk = :gsi2pk',
        ExpressionAttributeNames: {
          '#gsi2pk': 'GSI2PK',
        },
        ExpressionAttributeValues: {
          ':gsi2pk': 'EMAIL#test@example.com',
        },
        Limit: 1,
      });
    });

    it('該当ユーザーがない場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await repository.getByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });
});
