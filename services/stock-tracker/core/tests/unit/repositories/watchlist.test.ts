/**
 * Stock Tracker Core - Watchlist Repository Unit Tests
 *
 * WatchlistRepositoryのユニットテスト
 */

import {
  WatchlistRepository,
  WatchlistNotFoundError,
  InvalidWatchlistDataError,
  WatchlistAlreadyExistsError,
} from '../../../src/repositories/watchlist.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

describe('WatchlistRepository', () => {
  let repository: WatchlistRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new WatchlistRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getByUserId', () => {
    it('ユーザーのウォッチリスト一覧を取得できる', async () => {
      const mockWatchlists = [
        {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
          Type: 'Watchlist',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
        },
        {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NYSE:TSLA',
          Type: 'Watchlist',
          UserID: 'user-123',
          TickerID: 'NYSE:TSLA',
          ExchangeID: 'NYSE',
          CreatedAt: 1704153600000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockWatchlists,
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      });
      expect(result.items[1]).toEqual({
        UserID: 'user-123',
        TickerID: 'NYSE:TSLA',
        ExchangeID: 'NYSE',
        CreatedAt: 1704153600000,
      });
      expect(result.lastKey).toBeUndefined();

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            IndexName: 'UserIndex',
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': 'user-123',
              ':sk': 'Watchlist#',
            },
            Limit: 50,
          }),
        })
      );
    });

    it('ウォッチリストが存在しない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      const result = await repository.getByUserId('user-999');

      expect(result.items).toHaveLength(0);
      expect(result.lastKey).toBeUndefined();
    });

    it('limitパラメータが正しく使用される', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      await repository.getByUserId('user-123', 10);

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Limit: 10,
          }),
        })
      );
    });

    it('lastKeyパラメータが正しく使用される', async () => {
      const lastKey = { PK: 'user-123', SK: 'Watchlist#NSDQ:AAPL' };

      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      await repository.getByUserId('user-123', 50, lastKey);

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            ExclusiveStartKey: lastKey,
          }),
        })
      );
    });

    it('ページネーション用のlastKeyが返される', async () => {
      const mockLastKey = { PK: 'user-123', SK: 'Watchlist#NYSE:TSLA' };

      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-123',
            SK: 'WATCHLIST#NSDQ:AAPL',
            Type: 'Watchlist',
            UserID: 'user-123',
            TickerID: 'NSDQ:AAPL',
            ExchangeID: 'NASDAQ',
            CreatedAt: 1704067200000,
          },
        ],
        LastEvaluatedKey: mockLastKey,
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(1);
      expect(result.lastKey).toEqual(mockLastKey);
    });

    it('データベースエラー時にエラーをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(repository.getByUserId('user-123')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('不正なUserIDフィールドの場合はInvalidWatchlistDataErrorをスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-123',
            SK: 'WATCHLIST#NSDQ:AAPL',
            Type: 'Watchlist',
            UserID: '', // 不正な値
            TickerID: 'NSDQ:AAPL',
            ExchangeID: 'NASDAQ',
            CreatedAt: 1704067200000,
          },
        ],
        $metadata: {},
      });

      await expect(repository.getByUserId('user-123')).rejects.toThrow(InvalidWatchlistDataError);
    });
  });

  describe('getById', () => {
    it('単一のウォッチリストを取得できる', async () => {
      const mockWatchlist = {
        PK: 'USER#user-123',
        SK: 'WATCHLIST#NSDQ:AAPL',
        Type: 'Watchlist',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockWatchlist,
        $metadata: {},
      });

      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toEqual({
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        CreatedAt: 1704067200000,
      });

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'USER#user-123',
              SK: 'WATCHLIST#NSDQ:AAPL',
            },
          }),
        })
      );
    });

    it('ウォッチリストが存在しない場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getById('user-123', 'NSDQ:NVDA');

      expect(result).toBeNull();
    });

    it('データベースエラー時にエラーをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('不正なTickerIDフィールドの場合はInvalidWatchlistDataErrorをスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
          Type: 'Watchlist',
          UserID: 'user-123',
          TickerID: '', // 不正な値
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidWatchlistDataError
      );
    });

    it('不正なExchangeIDフィールドの場合はInvalidWatchlistDataErrorをスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
          Type: 'Watchlist',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: '', // 不正な値
          CreatedAt: 1704067200000,
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidWatchlistDataError
      );
    });

    it('CreatedAtが数値でない場合はInvalidWatchlistDataErrorをスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
          Type: 'Watchlist',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          CreatedAt: '1704067200000', // 不正な型
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidWatchlistDataError
      );
    });
  });

  describe('create', () => {
    it('新しいウォッチリストを作成できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const watchlistData = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const result = await repository.create(watchlistData);

      expect(result).toMatchObject({
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      });
      expect(result.CreatedAt).toBeGreaterThan(0);

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Item: expect.objectContaining({
              PK: 'USER#user-123',
              SK: 'WATCHLIST#NSDQ:AAPL',
              Type: 'Watchlist',
              UserID: 'user-123',
              TickerID: 'NSDQ:AAPL',
              ExchangeID: 'NASDAQ',
            }),
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        })
      );
    });

    it('既に存在するウォッチリストの場合はWatchlistAlreadyExistsErrorをスローする', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(error);

      const watchlistData = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await expect(repository.create(watchlistData)).rejects.toThrow(WatchlistAlreadyExistsError);
    });

    it('データベースエラー時にエラーをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      const watchlistData = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await expect(repository.create(watchlistData)).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('CreatedAtが自動的に設定される', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const beforeCreate = Date.now();
      const watchlistData = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };
      const result = await repository.create(watchlistData);
      const afterCreate = Date.now();

      expect(result.CreatedAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(result.CreatedAt).toBeLessThanOrEqual(afterCreate);
    });
  });

  describe('delete', () => {
    it('ウォッチリストを削除できる', async () => {
      // 存在確認のモック
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
          Type: 'Watchlist',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
        },
        $metadata: {},
      });

      // 削除のモック
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.delete('user-123', 'NSDQ:AAPL');

      expect(mockDocClient.send).toHaveBeenCalledTimes(2);

      // 2回目の呼び出しが削除コマンド
      expect(mockDocClient.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'USER#user-123',
              SK: 'WATCHLIST#NSDQ:AAPL',
            },
            ConditionExpression: 'attribute_exists(PK)',
          }),
        })
      );
    });

    it('存在しないウォッチリストの削除時はWatchlistNotFoundErrorをスローする', async () => {
      // 存在確認のモック（存在しない）
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await expect(repository.delete('user-123', 'NSDQ:NVDA')).rejects.toThrow(
        WatchlistNotFoundError
      );
    });

    it('データベースエラー時にエラーをスローする', async () => {
      // 存在確認のモック
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
          Type: 'Watchlist',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
        },
        $metadata: {},
      });

      // 削除時にエラー
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(repository.delete('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('削除前に存在確認が実行される', async () => {
      // 存在確認のモック
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'WATCHLIST#NSDQ:AAPL',
          Type: 'Watchlist',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1704067200000,
        },
        $metadata: {},
      });

      // 削除のモック
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.delete('user-123', 'NSDQ:AAPL');

      // 1回目の呼び出しが存在確認（GetCommand）
      expect(mockDocClient.send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'USER#user-123',
              SK: 'WATCHLIST#NSDQ:AAPL',
            },
          }),
        })
      );
    });
  });

  describe('エッジケース', () => {
    it('複数ユーザーのウォッチリストが混在しても正しく取得できる', async () => {
      // user-123 のみが返される
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-123',
            SK: 'WATCHLIST#NSDQ:AAPL',
            Type: 'Watchlist',
            UserID: 'user-123',
            TickerID: 'NSDQ:AAPL',
            ExchangeID: 'NASDAQ',
            CreatedAt: 1704067200000,
          },
        ],
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].UserID).toBe('user-123');
    });

    it('同じティッカーを異なるユーザーが監視できる', async () => {
      // user-123 の作成
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const watchlist1 = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };
      await repository.create(watchlist1);

      // user-456 の作成（同じティッカー）
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const watchlist2 = {
        UserID: 'user-456',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };
      await repository.create(watchlist2);

      // 異なるPK/SKなので両方作成できることを確認
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      expect(mockDocClient.send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              PK: 'USER#user-123',
              SK: 'WATCHLIST#NSDQ:AAPL',
            }),
          }),
        })
      );
      expect(mockDocClient.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              PK: 'USER#user-456',
              SK: 'WATCHLIST#NSDQ:AAPL',
            }),
          }),
        })
      );
    });
  });
});
