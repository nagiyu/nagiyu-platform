import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBGroupRepository } from '../../../../src/repositories/group/dynamodb-group-repository.js';
import { parseUpdateExpression } from '../../../helpers/update-expression.js';

import { DatabaseError } from '@nagiyu/aws';

const createSdkError = (): Error =>
  Object.assign(new Error('スループット超過'), { name: 'ProvisionedThroughputExceededException' });

describe('DynamoDBGroupRepository', () => {
  const TABLE_NAME = 'test-share-together-main';
  let repository: DynamoDBGroupRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    mockDocClient = {
      send: jest.fn(),
    };

    repository = new DynamoDBGroupRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getById', () => {
    it('グループIDでグループを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'GROUP#group-1',
          SK: '#META#',
          groupId: 'group-1',
          name: 'テストグループ',
          ownerUserId: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const result = await repository.getById('group-1');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;

      expect(result).toEqual({
        groupId: 'group-1',
        name: 'テストグループ',
        ownerUserId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'GROUP#group-1',
          SK: '#META#',
        },
      });
    });

    it('グループが存在しない場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('group-404');

      expect(result).toBeNull();
    });
  });

  describe('batchGetByIds', () => {
    it('空配列の場合はDynamoDBアクセスせず空配列を返す', async () => {
      const result = await repository.batchGetByIds([]);

      expect(result).toEqual([]);
      expect(mockDocClient.send).not.toHaveBeenCalled();
    });

    it('グループID配列でグループを一括取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Responses: {
          [TABLE_NAME]: [
            {
              PK: 'GROUP#group-1',
              SK: '#META#',
              groupId: 'group-1',
              name: 'グループ1',
              ownerUserId: 'user-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            {
              PK: 'GROUP#group-2',
              SK: '#META#',
              groupId: 'group-2',
              name: 'グループ2',
              ownerUserId: 'user-2',
              createdAt: '2026-01-02T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
          ],
        },
      });

      const result = await repository.batchGetByIds(['group-1', 'group-2']);
      const command = mockDocClient.send.mock.calls[0][0] as BatchGetCommand;

      expect(result).toEqual([
        {
          groupId: 'group-1',
          name: 'グループ1',
          ownerUserId: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          groupId: 'group-2',
          name: 'グループ2',
          ownerUserId: 'user-2',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
      expect(command.input).toEqual({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: [
              {
                PK: 'GROUP#group-1',
                SK: '#META#',
              },
              {
                PK: 'GROUP#group-2',
                SK: '#META#',
              },
            ],
          },
        },
      });
    });
  });

  describe('create', () => {
    it('グループを作成できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      const result = await repository.create({
        groupId: 'group-1',
        name: 'テストグループ',
        ownerUserId: 'user-1',
      });
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      const item = command.input.Item as Record<string, unknown>;

      expect(result).toEqual({
        groupId: 'group-1',
        name: 'テストグループ',
        ownerUserId: 'user-1',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(item['PK']).toBe('GROUP#group-1');
      expect(item['SK']).toBe('#META#');
      expect(item['groupId']).toBe('group-1');
      expect(item['name']).toBe('テストグループ');
      expect(item['ownerUserId']).toBe('user-1');
      expect(item['createdAt']).toEqual(result.createdAt);
      expect(item['updatedAt']).toEqual(result.updatedAt);
      expect(command.input.ConditionExpression).toBe(
        'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      );
    });

    it('同一グループが既に存在する場合はエラーを投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({
        name: 'ConditionalCheckFailedException',
      });

      await expect(
        repository.create({
          groupId: 'group-1',
          name: 'テストグループ',
          ownerUserId: 'user-1',
        })
      ).rejects.toThrow('グループは既に存在します');
    });
  });

  describe('update', () => {
    it('グループを更新できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: {
          PK: 'GROUP#group-1',
          SK: '#META#',
          groupId: 'group-1',
          name: '更新後グループ',
          ownerUserId: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      });

      const result = await repository.update('group-1', { name: '更新後グループ' });
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;

      expect(result).toEqual({
        groupId: 'group-1',
        name: '更新後グループ',
        ownerUserId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
      expect(command.input.TableName).toBe(TABLE_NAME);
      expect(command.input.Key).toEqual({
        PK: 'GROUP#group-1',
        SK: '#META#',
      });
      expect(parseUpdateExpression(command.input).set).toEqual({
        name: '更新後グループ',
        updatedAt: expect.any(String),
      });
      expect(command.input.ConditionExpression).toBe(
        'attribute_exists(PK) AND attribute_exists(SK)'
      );
      expect(command.input.ReturnValues).toBe('ALL_NEW');
    });

    it('グループが存在しない場合はエラーを投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({
        name: 'ConditionalCheckFailedException',
      });

      await expect(repository.update('group-404', { name: '更新後グループ' })).rejects.toThrow(
        'グループが見つかりません'
      );
    });
  });

  describe('delete', () => {
    it('グループを削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      await repository.delete('group-1');
      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;

      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'GROUP#group-1',
          SK: '#META#',
        },
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
      });
    });

    it('グループが存在しない場合はエラーを投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({
        name: 'ConditionalCheckFailedException',
      });

      await expect(repository.delete('group-404')).rejects.toThrow('グループが見つかりません');
    });
  });

  describe('batchGetByIds の分割と再送', () => {
    const createGroupItem = (groupId: string): Record<string, unknown> => ({
      PK: `GROUP#${groupId}`,
      SK: '#META#',
      groupId,
      name: groupId,
      ownerUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    it('未処理キーを再送して取得できる', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Responses: { [TABLE_NAME]: [createGroupItem('group-1')] },
          UnprocessedKeys: { [TABLE_NAME]: { Keys: [{ PK: 'GROUP#group-2', SK: '#META#' }] } },
        })
        .mockResolvedValueOnce({ Responses: { [TABLE_NAME]: [createGroupItem('group-2')] } });

      const result = await repository.batchGetByIds(['group-1', 'group-2']);

      expect(result.map((group) => group.groupId)).toEqual(['group-1', 'group-2']);
      const retryCommand = mockDocClient.send.mock.calls[1][0] as BatchGetCommand;
      expect(retryCommand.input.RequestItems?.[TABLE_NAME]?.Keys).toEqual([
        { PK: 'GROUP#group-2', SK: '#META#' },
      ]);
    });

    it('100件を超える場合は分割して取得する', async () => {
      const groupIds = Array.from({ length: 101 }, (_, i) => `group-${i}`);
      mockDocClient.send
        .mockResolvedValueOnce({ Responses: { [TABLE_NAME]: [createGroupItem('group-0')] } })
        .mockResolvedValueOnce({ Responses: { [TABLE_NAME]: [createGroupItem('group-100')] } });

      const result = await repository.batchGetByIds(groupIds);

      expect(result.map((group) => group.groupId)).toEqual(['group-0', 'group-100']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      const first = mockDocClient.send.mock.calls[0][0] as BatchGetCommand;
      const second = mockDocClient.send.mock.calls[1][0] as BatchGetCommand;
      expect(first.input.RequestItems?.[TABLE_NAME]?.Keys).toHaveLength(100);
      expect(second.input.RequestItems?.[TABLE_NAME]?.Keys).toHaveLength(1);
    });
  });

  describe('SDK例外のDatabaseError化', () => {
    it('取得時のSDK例外はDatabaseErrorに包まれる', async () => {
      mockDocClient.send.mockRejectedValueOnce(createSdkError());

      const promise = repository.getById('group-1');

      await expect(promise).rejects.toBeInstanceOf(DatabaseError);
      await expect(promise).rejects.toMatchObject({
        cause: expect.objectContaining({ name: 'ProvisionedThroughputExceededException' }),
      });
    });

    it('削除時の条件違反以外のSDK例外はDatabaseErrorに包まれる', async () => {
      mockDocClient.send.mockRejectedValueOnce(createSdkError());

      const promise = repository.delete('group-1');

      await expect(promise).rejects.toBeInstanceOf(DatabaseError);
      await expect(promise).rejects.toMatchObject({
        cause: expect.objectContaining({ name: 'ProvisionedThroughputExceededException' }),
      });
    });

    it('削除対象がない場合は素のErrorのまま日本語メッセージで投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });

      const promise = repository.delete('group-404');

      await expect(promise).rejects.toThrow('グループが見つかりません');
      await expect(promise).rejects.not.toBeInstanceOf(DatabaseError);
    });
  });
});
