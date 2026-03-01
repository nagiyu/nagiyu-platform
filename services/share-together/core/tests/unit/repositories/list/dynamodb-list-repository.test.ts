import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBListRepository } from '../../../../src/repositories/list/dynamodb-list-repository.js';

describe('DynamoDBListRepository', () => {
  const TABLE_NAME = 'test-share-together-main';
  let repository: DynamoDBListRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    mockDocClient = {
      send: jest.fn(),
    };

    repository = new DynamoDBListRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPersonalListsByUserId', () => {
    it('ユーザーIDで個人リスト一覧を取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-1',
            SK: 'PLIST#list-1',
            listId: 'list-1',
            userId: 'user-1',
            name: 'デフォルトリスト',
            isDefault: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            PK: 'USER#user-1',
            SK: 'PLIST#list-2',
            listId: 'list-2',
            userId: 'user-1',
            name: '買い物リスト',
            isDefault: false,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      });

      const result = await repository.getPersonalListsByUserId('user-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as QueryCommand;

      expect(result).toEqual([
        {
          listId: 'list-1',
          userId: 'user-1',
          name: 'デフォルトリスト',
          isDefault: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          listId: 'list-2',
          userId: 'user-1',
          name: '買い物リスト',
          isDefault: false,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': 'USER#user-1',
          ':skPrefix': 'PLIST#',
        },
      });
    });

    it('個人リストがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: undefined });

      const result = await repository.getPersonalListsByUserId('user-404');

      expect(result).toEqual([]);
    });
  });

  describe('getPersonalListById', () => {
    it('ユーザーIDとリストIDで個人リストを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-1',
          SK: 'PLIST#list-1',
          listId: 'list-1',
          userId: 'user-1',
          name: 'デフォルトリスト',
          isDefault: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const result = await repository.getPersonalListById('user-1', 'list-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as GetCommand;

      expect(result).toEqual({
        listId: 'list-1',
        userId: 'user-1',
        name: 'デフォルトリスト',
        isDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'USER#user-1',
          SK: 'PLIST#list-1',
        },
      });
    });

    it('該当リストがない場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getPersonalListById('user-1', 'list-404');

      expect(result).toBeNull();
    });
  });
});
