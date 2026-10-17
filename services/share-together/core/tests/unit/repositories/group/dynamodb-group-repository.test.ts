/**
 * DynamoDBGroupRepository のユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは正しいキーと保存形式で委譲していることと、独自のバッチ取得だけを検証する。
 */

import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  DatabaseError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidEntityDataError,
} from '@nagiyu/aws';
import { DynamoDBGroupRepository } from '../../../../src/repositories/group/dynamodb-group-repository.js';
import { parseUpdateExpression } from '../../../helpers/update-expression.js';

const TABLE_NAME = 'test-share-together-table';
const NOW = 1704067300000;
const CREATED_AT = 1704067200000;

function buildItem(groupId: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: `GROUP#${groupId}`,
    SK: '#META#',
    Type: 'Group',
    GroupID: groupId,
    Name: `名前-${groupId}`,
    OwnerUserID: 'owner-1',
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('DynamoDBGroupRepository', () => {
  let repository: DynamoDBGroupRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockDocClient = { send: jest.fn() };
    repository = new DynamoDBGroupRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('getById', () => {
    it('PK/SK で取得し Entity に変換する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem('g1') });

      const result = await repository.getById('g1');

      expect(result).toEqual({
        groupId: 'g1',
        name: '名前-g1',
        ownerUserId: 'owner-1',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'GROUP#g1', SK: '#META#' });
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({});
      await expect(repository.getById('g1')).resolves.toBeNull();
    });

    it('旧形式のデータも読める', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'GROUP#g1',
          SK: '#META#',
          groupId: 'g1',
          name: '旧',
          ownerUserId: 'owner-1',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      });

      const result = await repository.getById('g1');

      expect(result?.name).toBe('旧');
      expect(result?.createdAt).toBe(CREATED_AT);
    });

    it('読めないデータは InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: buildItem('g1', { OwnerUserID: undefined }),
      });
      await expect(repository.getById('g1')).rejects.toThrow(InvalidEntityDataError);
    });
  });

  describe('batchGetByIds', () => {
    it('空配列なら DynamoDB を呼ばず空を返す', async () => {
      await expect(repository.batchGetByIds([])).resolves.toEqual([]);
      expect(mockDocClient.send).not.toHaveBeenCalled();
    });

    it('重複した ID は 1 回だけ引き、Entity に変換して返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Responses: { [TABLE_NAME]: [buildItem('g1'), buildItem('g2')] },
      });

      const result = await repository.batchGetByIds(['g1', 'g2', 'g1']);

      expect(result.map((group) => group.groupId)).toEqual(['g1', 'g2']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as BatchGetCommand;
      expect(command).toBeInstanceOf(BatchGetCommand);
      expect(command.input.RequestItems?.[TABLE_NAME].Keys).toEqual([
        { PK: 'GROUP#g1', SK: '#META#' },
        { PK: 'GROUP#g2', SK: '#META#' },
      ]);
    });

    it('未処理キーは再送して全件を返す', async () => {
      jest.useRealTimers();
      mockDocClient.send
        .mockResolvedValueOnce({
          Responses: { [TABLE_NAME]: [buildItem('g1')] },
          UnprocessedKeys: { [TABLE_NAME]: { Keys: [{ PK: 'GROUP#g2', SK: '#META#' }] } },
        })
        .mockResolvedValueOnce({ Responses: { [TABLE_NAME]: [buildItem('g2')] } });

      const result = await repository.batchGetByIds(['g1', 'g2']);

      expect(result.map((group) => group.groupId)).toEqual(['g1', 'g2']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.batchGetByIds(['g1'])).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('保存形式の Item を条件付きで書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create({
        groupId: 'g1',
        name: '名前',
        ownerUserId: 'owner-1',
      });

      expect(result).toEqual({
        groupId: 'g1',
        name: '名前',
        ownerUserId: 'owner-1',
        createdAt: NOW,
        updatedAt: NOW,
      });
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input.Item).toEqual({
        PK: 'GROUP#g1',
        SK: '#META#',
        Type: 'Group',
        GroupID: 'g1',
        Name: '名前',
        OwnerUserID: 'owner-1',
        CreatedAt: NOW,
        UpdatedAt: NOW,
      });
    });

    it('既に存在する場合は EntityAlreadyExistsError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' })
      );

      await expect(
        repository.create({ groupId: 'g1', name: 'n', ownerUserId: 'owner-1' })
      ).rejects.toThrow(EntityAlreadyExistsError);
    });
  });

  describe('update', () => {
    it('保存用の属性名で更新し、旧名と UpdatedAt を整える', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('g1', { Name: '新しい名前', UpdatedAt: NOW }),
      });

      const result = await repository.update('g1', { name: '新しい名前' });

      expect(result.name).toBe('新しい名前');
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ PK: 'GROUP#g1', SK: '#META#' });
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toEqual({ Name: '新しい名前', UpdatedAt: NOW });
      expect(parsed.remove).toEqual(expect.arrayContaining(['name', 'updatedAt']));
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        Object.assign(new Error('missing'), { name: 'ConditionalCheckFailedException' })
      );

      await expect(repository.update('g1', { name: 'n' })).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('delete', () => {
    it('組み立てたキーで条件付き削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('g1');

      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'GROUP#g1', SK: '#META#' });
      expect(command.input.ConditionExpression).toBeDefined();
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        Object.assign(new Error('missing'), { name: 'ConditionalCheckFailedException' })
      );

      await expect(repository.delete('g1')).rejects.toThrow(EntityNotFoundError);
    });
  });
});
