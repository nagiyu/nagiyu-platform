/**
 * Stock Tracker Core - DynamoDB Watchlist Repository Unit Tests
 *
 * DynamoDBWatchlistRepositoryのユニットテスト
 */

import {
  DynamoDBWatchlistRepository,
  WatchlistNotFoundError,
  WatchlistAlreadyExistsError,
  InvalidWatchlistDataError,
} from '../../../src/repositories/dynamodb-watchlist.repository.js';
import { DatabaseError, InvalidEntityDataError } from '@nagiyu/aws';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreateWatchlistInput } from '../../../src/entities/watchlist.entity.js';

describe('DynamoDBWatchlistRepository', () => {
  let repository: DynamoDBWatchlistRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBWatchlistRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('新しいウォッチリストを作成できる', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.CreatedAt).toBeDefined();
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('同じユーザーIDとティッカーIDのウォッチリストが既に存在する場合はWatchlistAlreadyExistsErrorをスローする', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.create(input)).rejects.toThrow(WatchlistAlreadyExistsError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getById', () => {
    it('存在するウォッチリストを取得できる', async () => {
      const mockItem = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        GSI1PK: 'user-123',
        GSI1SK: 'Watchlist#NSDQ:AAPL',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockItem });

      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toMatchObject({
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      });
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないウォッチリストの場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('user-123', 'NSDQ:NOTFOUND');

      expect(result).toBeNull();
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(DatabaseError);
    });

    it('無効なエンティティデータの場合はInvalidWatchlistDataErrorをスローする', async () => {
      const mockInvalidItem = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        // 必須フィールド不足
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockInvalidItem });

      // InvalidEntityDataErrorをモックの内部で発生させる
      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(Error);
    });
  });

  describe('getByUserId', () => {
    it('ユーザーのウォッチリスト一覧を取得できる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
          Type: 'Watchlist',
          GSI1PK: 'user-123',
          GSI1SK: 'Watchlist#NSDQ:AAPL',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
        },
        {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:NVDA',
          Type: 'Watchlist',
          GSI1PK: 'user-123',
          GSI1SK: 'Watchlist#NSDQ:NVDA',
          UserID: 'user-123',
          TickerID: 'NSDQ:NVDA',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].UserID).toBe('user-123');
      expect(result.items[1].UserID).toBe('user-123');
      expect(result.count).toBe(2);
      expect(result.nextCursor).toBeUndefined();
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('該当するウォッチリストがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      const result = await repository.getByUserId('user-notfound');

      expect(result.items).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('ページネーションオプションを使用できる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
          Type: 'Watchlist',
          GSI1PK: 'user-123',
          GSI1SK: 'Watchlist#NSDQ:AAPL',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
        },
      ];

      const mockLastEvaluatedKey = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        GSI1PK: 'user-123',
        GSI1SK: 'Watchlist#NSDQ:AAPL',
      };

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 1,
        LastEvaluatedKey: mockLastEvaluatedKey,
      });

      const result = await repository.getByUserId('user-123', { limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.nextCursor).toBeDefined();
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('カーソルを使用してページネーションできる', async () => {
      const cursor = Buffer.from(
        JSON.stringify({
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
        })
      ).toString('base64');

      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:NVDA',
          Type: 'Watchlist',
          GSI1PK: 'user-123',
          GSI1SK: 'Watchlist#NSDQ:NVDA',
          UserID: 'user-123',
          TickerID: 'NSDQ:NVDA',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 1,
      });

      const result = await repository.getByUserId('user-123', { cursor });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].TickerID).toBe('NSDQ:NVDA');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getByUserId('user-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('ウォッチリストを削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('user-123', 'NSDQ:AAPL');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないウォッチリストを削除しようとするとWatchlistNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.delete('user-123', 'NSDQ:NOTFOUND')).rejects.toThrow(
        WatchlistNotFoundError
      );
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.delete('user-123', 'NSDQ:AAPL')).rejects.toThrow(DatabaseError);
    });
  });

  describe('カスタムエラークラス', () => {
    it('WatchlistNotFoundErrorが正しいメッセージを持つ', () => {
      const error = new WatchlistNotFoundError('user-123', 'NSDQ:AAPL');
      expect(error.name).toBe('WatchlistNotFoundError');
      expect(error.message).toContain('UserID=user-123');
      expect(error.message).toContain('TickerID=NSDQ:AAPL');
    });

    it('InvalidWatchlistDataErrorが正しいメッセージを持つ', () => {
      const error = new InvalidWatchlistDataError('無効なデータ');
      expect(error.name).toBe('InvalidWatchlistDataError');
      expect(error.message).toContain('無効なデータ');
    });

    it('WatchlistAlreadyExistsErrorが正しいメッセージを持つ', () => {
      const error = new WatchlistAlreadyExistsError('user-123', 'NSDQ:AAPL');
      expect(error.name).toBe('WatchlistAlreadyExistsError');
      expect(error.message).toContain('UserID=user-123');
      expect(error.message).toContain('TickerID=NSDQ:AAPL');
    });
  });
});
