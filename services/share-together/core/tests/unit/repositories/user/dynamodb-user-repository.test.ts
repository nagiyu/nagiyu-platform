/**
 * DynamoDBUserRepository のユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは正しいキーと保存形式で委譲していることと、独自のクエリだけを検証する。
 */

import {
  BatchGetCommand,
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
import { DynamoDBUserRepository } from '../../../../src/repositories/user/dynamodb-user-repository.js';
import { parseUpdateExpression } from '../../../helpers/update-expression.js';

const TABLE_NAME = 'test-share-together-table';
const NOW = 1704067300000;
const CREATED_AT = 1704067200000;

function buildItem(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: `USER#${userId}`,
    SK: '#META#',
    Type: 'User',
    GSI2PK: `EMAIL#${userId}@example.com`,
    UserID: userId,
    Email: `${userId}@example.com`,
    Name: `名前-${userId}`,
    DefaultListID: `list-${userId}`,
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('DynamoDBUserRepository', () => {
  let repository: DynamoDBUserRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockDocClient = { send: jest.fn() };
    repository = new DynamoDBUserRepository(
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
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem('u1') });

      const result = await repository.getById('u1');

      expect(result).toEqual({
        userId: 'u1',
        email: 'u1@example.com',
        name: '名前-u1',
        image: undefined,
        defaultListId: 'list-u1',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#u1', SK: '#META#' });
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({});
      await expect(repository.getById('u1')).resolves.toBeNull();
    });

    it('旧形式のデータも読める', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#u1',
          SK: '#META#',
          userId: 'u1',
          email: 'u1@example.com',
          name: '旧',
          defaultListId: 'list-u1',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      });

      const result = await repository.getById('u1');

      expect(result?.name).toBe('旧');
      expect(result?.createdAt).toBe(CREATED_AT);
    });

    it('読めないデータは InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem('u1', { Email: undefined }) });
      await expect(repository.getById('u1')).rejects.toThrow(InvalidEntityDataError);
    });
  });

  describe('getByEmail', () => {
    it('GSI2 を Query して Entity に変換する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [buildItem('u1')] });

      const result = await repository.getByEmail('u1@example.com');

      expect(result?.userId).toBe('u1');
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: '#gsi2pk = :gsi2pk',
        ExpressionAttributeNames: { '#gsi2pk': 'GSI2PK' },
        ExpressionAttributeValues: { ':gsi2pk': 'EMAIL#u1@example.com' },
        Limit: 1,
      });
    });

    it('該当がなければ null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });
      await expect(repository.getByEmail('none@example.com')).resolves.toBeNull();
    });

    it('Items が未定義でも null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({});
      await expect(repository.getByEmail('none@example.com')).resolves.toBeNull();
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.getByEmail('a@example.com')).rejects.toThrow(DatabaseError);
    });
  });

  describe('batchGetByIds', () => {
    it('空配列なら DynamoDB を呼ばず空を返す', async () => {
      await expect(repository.batchGetByIds([])).resolves.toEqual([]);
      expect(mockDocClient.send).not.toHaveBeenCalled();
    });

    it('重複した ID は 1 回だけ引き、Entity に変換して返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Responses: { [TABLE_NAME]: [buildItem('u1'), buildItem('u2')] },
      });

      const result = await repository.batchGetByIds(['u1', 'u2', 'u1']);

      expect(result.map((user) => user.userId)).toEqual(['u1', 'u2']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as BatchGetCommand;
      expect(command).toBeInstanceOf(BatchGetCommand);
      expect(command.input.RequestItems?.[TABLE_NAME].Keys).toEqual([
        { PK: 'USER#u1', SK: '#META#' },
        { PK: 'USER#u2', SK: '#META#' },
      ]);
    });

    it('未処理キーは再送して全件を返す', async () => {
      jest.useRealTimers();
      mockDocClient.send
        .mockResolvedValueOnce({
          Responses: { [TABLE_NAME]: [buildItem('u1')] },
          UnprocessedKeys: { [TABLE_NAME]: { Keys: [{ PK: 'USER#u2', SK: '#META#' }] } },
        })
        .mockResolvedValueOnce({ Responses: { [TABLE_NAME]: [buildItem('u2')] } });

      const result = await repository.batchGetByIds(['u1', 'u2']);

      expect(result.map((user) => user.userId)).toEqual(['u1', 'u2']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.batchGetByIds(['u1'])).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('保存形式の Item を条件付きで書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create({
        userId: 'u1',
        email: 'u1@example.com',
        name: '名前',
        image: 'https://example.com/a.png',
        defaultListId: 'list-1',
      });

      expect(result).toEqual({
        userId: 'u1',
        email: 'u1@example.com',
        name: '名前',
        image: 'https://example.com/a.png',
        defaultListId: 'list-1',
        createdAt: NOW,
        updatedAt: NOW,
      });
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input.Item).toEqual({
        PK: 'USER#u1',
        SK: '#META#',
        Type: 'User',
        GSI2PK: 'EMAIL#u1@example.com',
        UserID: 'u1',
        Email: 'u1@example.com',
        Name: '名前',
        Image: 'https://example.com/a.png',
        DefaultListID: 'list-1',
        CreatedAt: NOW,
        UpdatedAt: NOW,
      });
    });

    it('既に存在する場合は EntityAlreadyExistsError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' })
      );

      await expect(
        repository.create({ userId: 'u1', email: 'a@example.com', name: 'n', defaultListId: 'l' })
      ).rejects.toThrow(EntityAlreadyExistsError);
    });
  });

  describe('update', () => {
    it('保存用の属性名で更新し、email 変更時は GSI2PK を付け直す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('u1', { Email: 'new@example.com', UpdatedAt: NOW }),
      });

      const result = await repository.update('u1', { email: 'new@example.com' });

      expect(result.email).toBe('new@example.com');
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#u1', SK: '#META#' });
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toEqual({
        Email: 'new@example.com',
        GSI2PK: 'EMAIL#new@example.com',
        UpdatedAt: NOW,
      });
      expect(parsed.remove).toEqual(expect.arrayContaining(['email', 'updatedAt']));
    });

    it('image が null のときは Image と旧名 image を削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: buildItem('u1') });

      await repository.update('u1', { image: null as unknown as undefined });

      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(parseUpdateExpression(command.input).remove).toEqual(
        expect.arrayContaining(['Image', 'image'])
      );
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        Object.assign(new Error('missing'), { name: 'ConditionalCheckFailedException' })
      );

      await expect(repository.update('u1', { name: 'n' })).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('delete', () => {
    it('組み立てたキーで条件付き削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('u1');

      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#u1', SK: '#META#' });
      expect(command.input.ConditionExpression).toBeDefined();
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        Object.assign(new Error('missing'), { name: 'ConditionalCheckFailedException' })
      );

      await expect(repository.delete('u1')).rejects.toThrow(EntityNotFoundError);
    });
  });
});
