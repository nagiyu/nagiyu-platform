/**
 * Stock Tracker Core - DynamoDB Holding Repository Unit Tests
 *
 * DynamoDBHoldingRepositoryのユニットテスト
 */

import { DynamoDBHoldingRepository } from '../../../src/repositories/dynamodb-holding.repository.js';
import { EntityAlreadyExistsError, EntityNotFoundError, DatabaseError } from '@nagiyu/aws';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreateHoldingInput } from '../../../src/entities/holding.entity.js';

describe('DynamoDBHoldingRepository', () => {
  let repository: DynamoDBHoldingRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBHoldingRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('新しい保有株式を作成できる', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
      };

      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('同じUserID/TickerIDの保有株式が既に存在する場合はEntityAlreadyExistsErrorをスローする', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getById', () => {
    it('存在する保有株式を取得できる', async () => {
      const mockItem = {
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
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockItem,
        $metadata: {},
      });

      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toEqual({
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('存在しない保有株式を取得した場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toBeNull();
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByUserId', () => {
    it('ユーザーの全保有株式を取得できる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Quantity: 10,
          AveragePrice: 150,
          Currency: 'USD',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:NVDA',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:NVDA',
          UserID: 'user-123',
          TickerID: 'NSDQ:NVDA',
          ExchangeID: 'NASDAQ',
          Quantity: 5,
          AveragePrice: 450,
          Currency: 'USD',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 2,
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].TickerID).toBe('NSDQ:AAPL');
      expect(result.items[1].TickerID).toBe('NSDQ:NVDA');
    });

    it('保有株式が存在しない場合は空の配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toEqual([]);
    });

    it('ページネーションカーソルが正しく処理される', async () => {
      const lastKey = {
        PK: 'USER#user-123',
        SK: 'HOLDING#NSDQ:AAPL',
        GSI1PK: 'user-123',
        GSI1SK: 'Holding#NSDQ:AAPL',
      };
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: lastKey,
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123');

      expect(result.nextCursor).toBeDefined();
      expect(result.nextCursor).toBe(Buffer.from(JSON.stringify(lastKey)).toString('base64'));
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getByUserId('user-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('保有株式を更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'USER#user-123',
        SK: 'HOLDING#NSDQ:AAPL',
        Type: 'Holding',
        GSI1PK: 'user-123',
        GSI1SK: 'Holding#NSDQ:AAPL',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 20,
        AveragePrice: 155,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704153600000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
        $metadata: {},
      });

      const result = await repository.update('user-123', 'NSDQ:AAPL', {
        Quantity: 20,
        AveragePrice: 155,
      });

      expect(result.Quantity).toBe(20);
      expect(result.AveragePrice).toBe(155);
    });

    it('存在しない保有株式を更新しようとした場合はEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.update('user-123', 'NSDQ:AAPL', { Quantity: 20 })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('更新するフィールドが指定されていない場合はDatabaseErrorをスローする', async () => {
      await expect(repository.update('user-123', 'NSDQ:AAPL', {})).rejects.toThrow(DatabaseError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.update('user-123', 'NSDQ:AAPL', { Quantity: 20 })).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('delete', () => {
    it('保有株式を削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('user-123', 'NSDQ:AAPL');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しない保有株式を削除しようとした場合はEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.delete('user-123', 'NSDQ:AAPL')).rejects.toThrow(EntityNotFoundError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.delete('user-123', 'NSDQ:AAPL')).rejects.toThrow(DatabaseError);
    });
  });
});
