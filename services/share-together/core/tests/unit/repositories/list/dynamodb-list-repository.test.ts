import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBListRepository } from '../../../../src/repositories/list/dynamodb-list-repository.js';

import { DatabaseError } from '@nagiyu/aws';

const createSdkError = (): Error =>
  Object.assign(new Error('スループット超過'), { name: 'ProvisionedThroughputExceededException' });

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

      const result = await repository.updatePersonalList('user-1', 'list-1', {
        name: '更新後リスト',
      });
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

    it('リストが存在しない場合は個人リストエラーを投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({
        name: 'ConditionalCheckFailedException',
      });

      await expect(
        repository.updatePersonalList('user-1', 'list-404', { name: '更新後リスト' })
      ).rejects.toThrow('個人リストが見つかりません');
    });

    it('条件違反以外のエラーはそのまま再送出する', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(
        repository.updatePersonalList('user-1', 'list-404', { name: '更新後リスト' })
      ).rejects.toThrow('DynamoDB error');
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

  describe('getGroupListsByGroupId', () => {
    it('グループIDで共有リスト一覧を取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'GROUP#group-1',
            SK: 'GLIST#list-1',
            listId: 'list-1',
            groupId: 'group-1',
            name: '共有リスト1',
            createdBy: 'user-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const result = await repository.getGroupListsByGroupId('group-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as QueryCommand;

      expect(result).toEqual([
        {
          listId: 'list-1',
          groupId: 'group-1',
          name: '共有リスト1',
          createdBy: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
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
          ':pk': 'GROUP#group-1',
          ':skPrefix': 'GLIST#',
        },
      });
    });
  });

  describe('getGroupListById', () => {
    it('グループIDとリストIDで共有リストを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'GROUP#group-1',
          SK: 'GLIST#list-1',
          listId: 'list-1',
          groupId: 'group-1',
          name: '共有リスト1',
          createdBy: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const result = await repository.getGroupListById('group-1', 'list-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as GetCommand;

      expect(result).toEqual({
        listId: 'list-1',
        groupId: 'group-1',
        name: '共有リスト1',
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'GROUP#group-1',
          SK: 'GLIST#list-1',
        },
      });
    });
  });

  describe('createGroupList', () => {
    it('共有リストを作成できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      const result = await repository.createGroupList({
        listId: 'list-3',
        groupId: 'group-1',
        name: '新しい共有リスト',
        createdBy: 'user-1',
      });
      const command = mockDocClient.send.mock.calls[0]?.[0] as PutCommand;

      expect(result).toMatchObject({
        listId: 'list-3',
        groupId: 'group-1',
        name: '新しい共有リスト',
        createdBy: 'user-1',
      });
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'GROUP#group-1',
          SK: 'GLIST#list-3',
          listId: 'list-3',
          groupId: 'group-1',
          name: '新しい共有リスト',
          createdBy: 'user-1',
        },
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      });
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
    });
  });

  describe('updateGroupList', () => {
    it('共有リスト名を更新できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: {
          PK: 'GROUP#group-1',
          SK: 'GLIST#list-1',
          listId: 'list-1',
          groupId: 'group-1',
          name: '更新後共有リスト',
          createdBy: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
        },
      });

      const result = await repository.updateGroupList('group-1', 'list-1', {
        name: '更新後共有リスト',
      });
      const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

      expect(result).toEqual({
        listId: 'list-1',
        groupId: 'group-1',
        name: '更新後共有リスト',
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      });
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Key: {
          PK: 'GROUP#group-1',
          SK: 'GLIST#list-1',
        },
        UpdateExpression: 'SET #updatedAt = :updatedAt, #name = :name',
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        ExpressionAttributeNames: {
          '#updatedAt': 'updatedAt',
          '#name': 'name',
        },
        ExpressionAttributeValues: {
          ':name': '更新後共有リスト',
        },
        ReturnValues: 'ALL_NEW',
      });
      expect(command.input.ExpressionAttributeValues).toMatchObject({
        ':updatedAt': expect.any(String),
      });
    });

    it('リストが存在しない場合はグループリストエラーを投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({
        name: 'ConditionalCheckFailedException',
      });

      await expect(
        repository.updateGroupList('group-1', 'list-404', { name: '更新後共有リスト' })
      ).rejects.toThrow('グループリストが見つかりません');
    });

    it('条件違反以外のエラーはそのまま再送出する', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(
        repository.updateGroupList('group-1', 'list-404', { name: '更新後共有リスト' })
      ).rejects.toThrow('DynamoDB error');
    });
  });

  describe('deleteGroupList', () => {
    it('共有リストを削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      await repository.deleteGroupList('group-1', 'list-2');

      const command = mockDocClient.send.mock.calls[0]?.[0] as DeleteCommand;
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'GROUP#group-1',
          SK: 'GLIST#list-2',
        },
      });
    });
  });

  describe('ページング', () => {
    const lastEvaluatedKey = { PK: 'USER#user-1', SK: 'PLIST#list-1' };

    it('getPersonalListsByUserId は複数ページにわたる全件を取得する', async () => {
      const createItem = (listId: string): Record<string, unknown> => ({
        PK: 'USER#user-1',
        SK: `PLIST#${listId}`,
        listId,
        userId: 'user-1',
        name: listId,
        isDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [createItem('list-1')],
          LastEvaluatedKey: lastEvaluatedKey,
        })
        .mockResolvedValueOnce({ Items: [createItem('list-2')] });

      const result = await repository.getPersonalListsByUserId('user-1');

      expect(result.map((list) => list.listId)).toEqual(['list-1', 'list-2']);
      const secondCommand = mockDocClient.send.mock.calls[1]?.[0] as QueryCommand;
      expect(secondCommand.input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });

    it('getGroupListsByGroupId は複数ページにわたる全件を取得する', async () => {
      const createItem = (listId: string): Record<string, unknown> => ({
        PK: 'GROUP#group-1',
        SK: `GLIST#${listId}`,
        listId,
        groupId: 'group-1',
        name: listId,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      const groupLastEvaluatedKey = { PK: 'GROUP#group-1', SK: 'GLIST#list-1' };
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [createItem('list-1')],
          LastEvaluatedKey: groupLastEvaluatedKey,
        })
        .mockResolvedValueOnce({ Items: [createItem('list-2')] });

      const result = await repository.getGroupListsByGroupId('group-1');

      expect(result.map((list) => list.listId)).toEqual(['list-1', 'list-2']);
      const secondCommand = mockDocClient.send.mock.calls[1]?.[0] as QueryCommand;
      expect(secondCommand.input.ExclusiveStartKey).toEqual(groupLastEvaluatedKey);
    });
  });

  describe('SDK例外のDatabaseError化', () => {
    it('個人リスト取得時のSDK例外はDatabaseErrorに包まれる', async () => {
      mockDocClient.send.mockRejectedValueOnce(createSdkError());

      const promise = repository.getPersonalListById('user-1', 'list-1');

      await expect(promise).rejects.toBeInstanceOf(DatabaseError);
      await expect(promise).rejects.toMatchObject({
        cause: expect.objectContaining({ name: 'ProvisionedThroughputExceededException' }),
      });
    });

    it('個人リスト更新時の条件違反以外のSDK例外はDatabaseErrorに包まれる', async () => {
      mockDocClient.send.mockRejectedValueOnce(createSdkError());

      const promise = repository.updatePersonalList('user-1', 'list-1', { name: '更新後' });

      await expect(promise).rejects.toBeInstanceOf(DatabaseError);
      await expect(promise).rejects.toMatchObject({
        cause: expect.objectContaining({ name: 'ProvisionedThroughputExceededException' }),
      });
    });

    it('共有リスト削除時のSDK例外はDatabaseErrorに包まれる', async () => {
      mockDocClient.send.mockRejectedValueOnce(createSdkError());

      const promise = repository.deleteGroupList('group-1', 'list-1');

      await expect(promise).rejects.toBeInstanceOf(DatabaseError);
      await expect(promise).rejects.toMatchObject({
        cause: expect.objectContaining({ name: 'ProvisionedThroughputExceededException' }),
      });
    });

    it('共有リスト更新対象がない場合は素のErrorのまま日本語メッセージで投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });

      const promise = repository.updateGroupList('group-1', 'list-404', { name: '更新後' });

      await expect(promise).rejects.toThrow('グループリストが見つかりません');
      await expect(promise).rejects.not.toBeInstanceOf(DatabaseError);
    });
  });
});
