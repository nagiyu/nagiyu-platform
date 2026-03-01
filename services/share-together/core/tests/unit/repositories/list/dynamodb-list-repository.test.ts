import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
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

  describe('createPersonalList', () => {
    it('個人リストを作成できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      const result = await repository.createPersonalList({
        listId: 'list-3',
        userId: 'user-1',
        name: '新しいリスト',
        isDefault: false,
      });
      const command = mockDocClient.send.mock.calls[0]?.[0] as PutCommand;

      expect(result).toMatchObject({
        listId: 'list-3',
        userId: 'user-1',
        name: '新しいリスト',
        isDefault: false,
      });
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'USER#user-1',
          SK: 'PLIST#list-3',
          listId: 'list-3',
          userId: 'user-1',
          name: '新しいリスト',
          isDefault: false,
        },
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      });
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
    });
  });

  describe('updatePersonalList', () => {
    it('個人リスト名を更新できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-1',
          SK: 'PLIST#list-1',
          listId: 'list-1',
          userId: 'user-1',
          name: '更新後リスト',
          isDefault: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
        },
      });

      const result = await repository.updatePersonalList('user-1', 'list-1', { name: '更新後リスト' });
      const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

      expect(result).toEqual({
        listId: 'list-1',
        userId: 'user-1',
        name: '更新後リスト',
        isDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      });
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Key: {
          PK: 'USER#user-1',
          SK: 'PLIST#list-1',
        },
        UpdateExpression: 'SET #updatedAt = :updatedAt, #name = :name',
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        ExpressionAttributeNames: {
          '#updatedAt': 'updatedAt',
          '#name': 'name',
        },
        ExpressionAttributeValues: {
          ':name': '更新後リスト',
        },
        ReturnValues: 'ALL_NEW',
      });
      expect(command.input.ExpressionAttributeValues).toMatchObject({
        ':updatedAt': expect.any(String),
      });
    });
  });

  describe('deletePersonalList', () => {
    it('通常リストを削除できる', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Item: {
            PK: 'USER#user-1',
            SK: 'PLIST#list-2',
            listId: 'list-2',
            userId: 'user-1',
            name: '買い物リスト',
            isDefault: false,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        })
        .mockResolvedValueOnce({});

      await repository.deletePersonalList('user-1', 'list-2');

      const getCommand = mockDocClient.send.mock.calls[0]?.[0] as GetCommand;
      const deleteCommand = mockDocClient.send.mock.calls[1]?.[0] as DeleteCommand;
      expect(getCommand.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'USER#user-1',
          SK: 'PLIST#list-2',
        },
      });
      expect(deleteCommand.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'USER#user-1',
          SK: 'PLIST#list-2',
        },
      });
    });

    it('デフォルトリストは削除できない', async () => {
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

      await expect(repository.deletePersonalList('user-1', 'list-1')).rejects.toThrow(
        'デフォルトリストは削除できません'
      );
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });
  });
});
