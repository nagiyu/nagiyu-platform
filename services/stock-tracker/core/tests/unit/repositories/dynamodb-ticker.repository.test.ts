/**
 * Stock Tracker Core - DynamoDB Ticker Repository Unit Tests
 *
 * DynamoDBTickerRepositoryのユニットテスト
 */

import { DynamoDBTickerRepository } from '../../../src/repositories/dynamodb-ticker.repository.js';
import { EntityAlreadyExistsError, EntityNotFoundError, DatabaseError } from '@nagiyu/aws';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreateTickerInput } from '../../../src/entities/ticker.entity.js';

describe('DynamoDBTickerRepository', () => {
  let repository: DynamoDBTickerRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBTickerRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('新しいティッカーを作成できる', async () => {
      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('同じTickerIDのティッカーが既に存在する場合はEntityAlreadyExistsErrorをスローする', async () => {
      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getById', () => {
    it('存在するティッカーを取得できる', async () => {
      const mockItem = {
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
        Type: 'Ticker',
        GSI3PK: 'NASDAQ',
        GSI3SK: 'TICKER#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockItem });

      const result = await repository.getById('NSDQ:AAPL');

      expect(result).toMatchObject({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      });
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないティッカーの場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('NSDQ:NOTFOUND');

      expect(result).toBeNull();
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getById('NSDQ:AAPL')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByExchange', () => {
    it('取引所ごとのティッカー一覧を取得できる', async () => {
      const mockItems = [
        {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          GSI3PK: 'NASDAQ',
          GSI3SK: 'TICKER#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        {
          PK: 'TICKER#NSDQ:NVDA',
          SK: 'METADATA',
          Type: 'Ticker',
          GSI3PK: 'NASDAQ',
          GSI3SK: 'TICKER#NSDQ:NVDA',
          TickerID: 'NSDQ:NVDA',
          Symbol: 'NVDA',
          Name: 'NVIDIA Corporation',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.getByExchange('NASDAQ');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].ExchangeID).toBe('NASDAQ');
      expect(result.items[1].ExchangeID).toBe('NASDAQ');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('該当するティッカーがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      const result = await repository.getByExchange('UNKNOWN');

      expect(result.items).toHaveLength(0);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getByExchange('NASDAQ')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getAll', () => {
    it('全てのティッカーを取得できる', async () => {
      const mockItems = [
        {
          PK: 'TICKER#NSDQ:AAPL',
          SK: 'METADATA',
          Type: 'Ticker',
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 1,
      });

      const result = await repository.getAll();

      expect(result.items).toHaveLength(1);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('ティッカーを更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
        Type: 'Ticker',
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc. (Updated)',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067300000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('NSDQ:AAPL', {
        Name: 'Apple Inc. (Updated)',
      });

      expect(result.Name).toBe('Apple Inc. (Updated)');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないティッカーを更新しようとするとEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.update('NSDQ:NOTFOUND', { Name: 'Updated' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('更新するフィールドがない場合はDatabaseErrorをスローする', async () => {
      await expect(repository.update('NSDQ:AAPL', {})).rejects.toThrow(DatabaseError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.update('NSDQ:AAPL', { Name: 'Updated' })).rejects.toThrow(
        DatabaseError
      );
    });

    it('Symbolフィールドを更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'TICKER#NSDQ:AAPL',
        SK: 'METADATA',
        Type: 'Ticker',
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL2',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067300000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('NSDQ:AAPL', {
        Symbol: 'AAPL2',
      });

      expect(result.Symbol).toBe('AAPL2');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('Attributesが存在しない場合はEntityNotFoundErrorをスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: undefined,
      });

      await expect(repository.update('NSDQ:AAPL', { Name: 'Updated' })).rejects.toThrow(
        EntityNotFoundError
      );
    });
  });

  describe('delete', () => {
    it('ティッカーを削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('NSDQ:AAPL');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないティッカーを削除しようとするとEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.delete('NSDQ:NOTFOUND')).rejects.toThrow(EntityNotFoundError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.delete('NSDQ:AAPL')).rejects.toThrow(DatabaseError);
    });
  });
});
