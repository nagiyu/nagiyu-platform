/**
 * DynamoDBListRepository のユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは正しいキーと保存形式で委譲していることと、独自の一覧 Query だけを検証する。
 */

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  DatabaseError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidEntityDataError,
} from '@nagiyu/aws';
import { DynamoDBListRepository } from '../../../../src/repositories/list/dynamodb-list-repository.js';
import { parseUpdateExpression } from '../../../helpers/update-expression.js';

const TABLE_NAME = 'test-share-together-table';
const NOW = 1704067300000;
const CREATED_AT = 1704067200000;

function buildPersonalItem(listId: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: 'USER#user-1',
    SK: `PLIST#${listId}`,
    Type: 'PersonalList',
    ListID: listId,
    UserID: 'user-1',
    Name: `名前-${listId}`,
    IsDefault: false,
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

function buildGroupItem(listId: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: 'GROUP#group-1',
    SK: `GLIST#${listId}`,
    Type: 'GroupList',
    ListID: listId,
    GroupID: 'group-1',
    Name: `名前-${listId}`,
    CreatedBy: 'user-1',
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

function conditionFailure(): Error {
  return Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
}

describe('DynamoDBListRepository', () => {
  let repository: DynamoDBListRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockDocClient = { send: jest.fn() };
    repository = new DynamoDBListRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('getPersonalListsByUserId', () => {
    it('PK と SK 接頭辞で Query し、Entity に変換して返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildPersonalItem('a'), buildPersonalItem('b', { IsDefault: true })],
      });

      const result = await repository.getPersonalListsByUserId('user-1');

      expect(result.map((list) => list.listId)).toEqual(['a', 'b']);
      expect(result[1].isDefault).toBe(true);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input.TableName).toBe(TABLE_NAME);
      expect(command.input.KeyConditionExpression).toBe(
        '#pk = :pk AND begins_with(#sk, :skPrefix)'
      );
      expect(command.input.ExpressionAttributeValues).toEqual({
        ':pk': 'USER#user-1',
        ':skPrefix': 'PLIST#',
      });
    });

    it('複数ページにまたがる結果をすべて返す', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildPersonalItem('a')],
          LastEvaluatedKey: { PK: 'USER#user-1', SK: 'PLIST#a' },
        })
        .mockResolvedValueOnce({ Items: [buildPersonalItem('b')] });

      const result = await repository.getPersonalListsByUserId('user-1');

      expect(result.map((list) => list.listId)).toEqual(['a', 'b']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('旧形式のデータも読める', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-1',
            SK: 'PLIST#a',
            listId: 'a',
            userId: 'user-1',
            name: '旧',
            isDefault: true,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });

      const [list] = await repository.getPersonalListsByUserId('user-1');

      expect(list).toEqual({
        listId: 'a',
        userId: 'user-1',
        name: '旧',
        isDefault: true,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
    });

    it('読めないデータは InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildPersonalItem('a', { IsDefault: undefined })],
      });
      await expect(repository.getPersonalListsByUserId('user-1')).rejects.toThrow(
        InvalidEntityDataError
      );
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.getPersonalListsByUserId('user-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getPersonalListById', () => {
    it('PK/SK で取得し Entity に変換する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildPersonalItem('a') });

      const result = await repository.getPersonalListById('user-1', 'a');

      expect(result).toEqual({
        listId: 'a',
        userId: 'user-1',
        name: '名前-a',
        isDefault: false,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-1', SK: 'PLIST#a' });
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({});
      await expect(repository.getPersonalListById('user-1', 'a')).resolves.toBeNull();
    });
  });

  describe('createPersonalList', () => {
    it('保存形式の Item を条件付きで書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.createPersonalList({
        listId: 'a',
        userId: 'user-1',
        name: '名前',
        isDefault: true,
      });

      expect(result).toEqual({
        listId: 'a',
        userId: 'user-1',
        name: '名前',
        isDefault: true,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input.Item).toEqual({
        PK: 'USER#user-1',
        SK: 'PLIST#a',
        Type: 'PersonalList',
        ListID: 'a',
        UserID: 'user-1',
        Name: '名前',
        IsDefault: true,
        CreatedAt: NOW,
        UpdatedAt: NOW,
      });
    });

    it('既に存在する場合は EntityAlreadyExistsError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());

      await expect(
        repository.createPersonalList({
          listId: 'a',
          userId: 'user-1',
          name: 'n',
          isDefault: false,
        })
      ).rejects.toThrow(EntityAlreadyExistsError);
    });
  });

  describe('updatePersonalList', () => {
    it('保存用の属性名で更新し、旧名と UpdatedAt を整える', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildPersonalItem('a', { Name: '新しい名前', UpdatedAt: NOW }),
      });

      const result = await repository.updatePersonalList('user-1', 'a', { name: '新しい名前' });

      expect(result.name).toBe('新しい名前');
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-1', SK: 'PLIST#a' });
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toEqual({ Name: '新しい名前', UpdatedAt: NOW });
      expect(parsed.remove).toEqual(expect.arrayContaining(['name', 'updatedAt']));
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());

      await expect(repository.updatePersonalList('user-1', 'a', { name: 'n' })).rejects.toThrow(
        EntityNotFoundError
      );
    });
  });

  describe('deletePersonalList', () => {
    it('無条件に削除し、対象がなくても成功する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await expect(repository.deletePersonalList('user-1', 'a')).resolves.toBeUndefined();

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-1', SK: 'PLIST#a' });
      expect(command.input.ConditionExpression).toBeUndefined();
    });

    it('デフォルトリストでも、リポジトリは事前の読み取りも検査もせず削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.deletePersonalList('user-1', 'default');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(DeleteCommand);
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.deletePersonalList('user-1', 'a')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getGroupListsByGroupId', () => {
    it('PK と SK 接頭辞で Query し、Entity に変換して返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildGroupItem('a'), buildGroupItem('b')],
      });

      const result = await repository.getGroupListsByGroupId('group-1');

      expect(result.map((list) => list.listId)).toEqual(['a', 'b']);
      expect(result[0]).toEqual({
        listId: 'a',
        groupId: 'group-1',
        name: '名前-a',
        createdBy: 'user-1',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input.ExpressionAttributeValues).toEqual({
        ':pk': 'GROUP#group-1',
        ':skPrefix': 'GLIST#',
      });
    });

    it('複数ページにまたがる結果をすべて返す', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildGroupItem('a')],
          LastEvaluatedKey: { PK: 'GROUP#group-1', SK: 'GLIST#a' },
        })
        .mockResolvedValueOnce({ Items: [buildGroupItem('b')] });

      const result = await repository.getGroupListsByGroupId('group-1');

      expect(result.map((list) => list.listId)).toEqual(['a', 'b']);
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.getGroupListsByGroupId('group-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getGroupListById', () => {
    it('PK/SK で取得し Entity に変換する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildGroupItem('a') });

      const result = await repository.getGroupListById('group-1', 'a');

      expect(result?.listId).toBe('a');
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command.input.Key).toEqual({ PK: 'GROUP#group-1', SK: 'GLIST#a' });
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({});
      await expect(repository.getGroupListById('group-1', 'a')).resolves.toBeNull();
    });
  });

  describe('createGroupList', () => {
    it('保存形式の Item を条件付きで書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.createGroupList({
        listId: 'a',
        groupId: 'group-1',
        name: '名前',
        createdBy: 'user-1',
      });

      expect(result).toEqual({
        listId: 'a',
        groupId: 'group-1',
        name: '名前',
        createdBy: 'user-1',
        createdAt: NOW,
        updatedAt: NOW,
      });
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command.input.Item).toEqual({
        PK: 'GROUP#group-1',
        SK: 'GLIST#a',
        Type: 'GroupList',
        ListID: 'a',
        GroupID: 'group-1',
        Name: '名前',
        CreatedBy: 'user-1',
        CreatedAt: NOW,
        UpdatedAt: NOW,
      });
    });

    it('既に存在する場合は EntityAlreadyExistsError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());

      await expect(
        repository.createGroupList({
          listId: 'a',
          groupId: 'group-1',
          name: 'n',
          createdBy: 'user-1',
        })
      ).rejects.toThrow(EntityAlreadyExistsError);
    });
  });

  describe('updateGroupList', () => {
    it('保存用の属性名で更新する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildGroupItem('a', { Name: '新しい名前', UpdatedAt: NOW }),
      });

      const result = await repository.updateGroupList('group-1', 'a', { name: '新しい名前' });

      expect(result.name).toBe('新しい名前');
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command.input.Key).toEqual({ PK: 'GROUP#group-1', SK: 'GLIST#a' });
      expect(parseUpdateExpression(command.input).set).toEqual({
        Name: '新しい名前',
        UpdatedAt: NOW,
      });
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());

      await expect(repository.updateGroupList('group-1', 'a', { name: 'n' })).rejects.toThrow(
        EntityNotFoundError
      );
    });
  });

  describe('deleteGroupList', () => {
    it('無条件に削除し、対象がなくても成功する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await expect(repository.deleteGroupList('group-1', 'a')).resolves.toBeUndefined();

      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'GROUP#group-1', SK: 'GLIST#a' });
      expect(command.input.ConditionExpression).toBeUndefined();
    });
  });
});
