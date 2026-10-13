/**
 * Stock Tracker Core - DynamoDB Holding Repository Unit Tests
 *
 * DynamoDBHoldingRepositoryのユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは正しいキーと保存形式で委譲していることと、GSI の Query だけを検証する。
 */

import { DynamoDBHoldingRepository } from '../../../src/repositories/dynamodb-holding.repository.js';
import { parseUpdateExpression } from '../../helpers/update-expression.js';
import { DatabaseError } from '@nagiyu/aws';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { CreateHoldingInput } from '../../../src/entities/holding.entity.js';

const NOW = 1704067300000;
const CREATED_AT = 1704067200000;

function buildItem(tickerId: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: 'USER#user-123',
    SK: `HOLDING#${tickerId}`,
    Type: 'Holding',
    GSI1PK: 'user-123',
    GSI1SK: `Holding#${tickerId}`,
    UserID: 'user-123',
    TickerID: tickerId,
    ExchangeID: 'NASDAQ',
    Quantity: 10,
    AveragePrice: 150,
    Currency: 'USD',
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('DynamoDBHoldingRepository', () => {
  let repository: DynamoDBHoldingRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);

    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBHoldingRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('create', () => {
    const input: CreateHoldingInput = {
      userId: 'user-123',
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NASDAQ',
      quantity: 10.5,
      averagePrice: 150.25,
      currency: 'USD',
    };

    it('新しい保有株式を保存形式の Item として書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result).toEqual({ ...input, createdAt: NOW, updatedAt: NOW });
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Quantity: 10.5,
          AveragePrice: 150.25,
          Currency: 'USD',
          CreatedAt: NOW,
          UpdatedAt: NOW,
        },
      });
    });
  });

  describe('getById', () => {
    it('存在する保有株式を Entity として取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: buildItem('NSDQ:AAPL', { Quantity: 10.5, AveragePrice: 150.25 }),
      });

      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toEqual({
        userId: 'user-123',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        quantity: 10.5,
        averagePrice: 150.25,
        currency: 'USD',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-123', SK: 'HOLDING#NSDQ:AAPL' });
    });
  });

  describe('getByUserId', () => {
    it('UserIndex の Query でユーザーの保有株式一覧を取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('NSDQ:AAPL'), buildItem('NSDQ:NVDA')],
        Count: 2,
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items.map((holding) => holding.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:NVDA']);
      expect(result.count).toBe(2);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'UserIndex',
        KeyConditionExpression: '#gsi1pk = :userId AND begins_with(#gsi1sk, :prefix)',
        ExpressionAttributeNames: { '#gsi1pk': 'GSI1PK', '#gsi1sk': 'GSI1SK' },
        ExpressionAttributeValues: { ':userId': 'user-123', ':prefix': 'Holding#' },
      });
    });

    it('limit 未指定時は既定の 50 件を Limit に指定する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      await repository.getByUserId('user-123');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.Limit).toBe(50);
    });

    it('limit を指定するとその値を Limit に指定する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      await repository.getByUserId('user-123', { limit: 2 });

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.Limit).toBe(2);
    });

    it('保有株式が存在しない場合は空の配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [], Count: 0 });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('LastEvaluatedKey を nextCursor として返し、次の呼び出しで ExclusiveStartKey に渡す', async () => {
      const lastEvaluatedKey = {
        PK: 'USER#user-123',
        SK: 'HOLDING#NSDQ:AAPL',
        GSI1PK: 'user-123',
        GSI1SK: 'Holding#NSDQ:AAPL',
      };
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAPL')],
          Count: 1,
          LastEvaluatedKey: lastEvaluatedKey,
        })
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:NVDA')], Count: 1 });

      const first = await repository.getByUserId('user-123', { limit: 1 });
      const second = await repository.getByUserId('user-123', {
        limit: 1,
        cursor: first.nextCursor,
      });

      expect(first.nextCursor).toBe(
        Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64')
      );
      expect(second.items.map((holding) => holding.tickerId)).toEqual(['NSDQ:NVDA']);
      expect(second.nextCursor).toBeUndefined();
      const secondQuery = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(secondQuery.input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByUserId('user-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('保有株式を更新し、更新後の Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('NSDQ:AAPL', { Quantity: 20, AveragePrice: 155, UpdatedAt: NOW }),
      });

      const result = await repository.update('user-123', 'NSDQ:AAPL', {
        quantity: 20,
        averagePrice: 155,
      });

      expect(result.quantity).toBe(20);
      expect(result.averagePrice).toBe(155);
      expect(result.updatedAt).toBe(NOW);
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-123', SK: 'HOLDING#NSDQ:AAPL' });
      expect(parseUpdateExpression(command.input).set).toEqual({
        Quantity: 20,
        AveragePrice: 155,
        UpdatedAt: NOW,
      });
    });
  });

  describe('delete', () => {
    it('ユーザーIDとティッカーIDから組み立てたキーで削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('user-123', 'NSDQ:AAPL');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'USER#user-123', SK: 'HOLDING#NSDQ:AAPL' });
    });
  });
});
