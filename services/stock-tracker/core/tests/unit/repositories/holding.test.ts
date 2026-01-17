/**
 * Stock Tracker Core - Holding Repository Unit Tests
 *
 * HoldingRepositoryのユニットテスト
 */

import {
  HoldingRepository,
  HoldingNotFoundError,
  InvalidHoldingDataError,
  HoldingAlreadyExistsError,
} from '../../../src/repositories/holding.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

describe('HoldingRepository', () => {
  let repository: HoldingRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new HoldingRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getByUserId', () => {
    it('データベースエラー時にエラーをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getByUserId('user-123')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('ユーザーの全保有株式を取得できる', async () => {
      const mockHoldings = [
        {
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
          Quantity: 5.0,
          AveragePrice: 450.0,
          Currency: 'USD',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockHoldings,
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
      expect(result.items[1]).toEqual({
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Quantity: 5.0,
        AveragePrice: 450.0,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
      expect(result.lastKey).toBeUndefined();

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            IndexName: 'UserIndex',
            KeyConditionExpression: '#gsi1pk = :userId AND begins_with(#gsi1sk, :prefix)',
            ExpressionAttributeNames: {
              '#gsi1pk': 'GSI1PK',
              '#gsi1sk': 'GSI1SK',
            },
            ExpressionAttributeValues: {
              ':userId': 'user-123',
              ':prefix': 'Holding#',
            },
            Limit: 50,
          }),
        })
      );
    });

    it('limitとlastKeyを指定してページネーション取得できる', async () => {
      const mockHoldings = [
        {
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
        },
      ];

      const lastEvaluatedKey = { PK: 'USER#user-123', SK: 'HOLDING#NSDQ:AAPL' };

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockHoldings,
        LastEvaluatedKey: lastEvaluatedKey,
        $metadata: {},
      });

      const lastKey = { PK: 'USER#user-123', SK: 'HOLDING#NSDQ:TSLA' };
      const result = await repository.getByUserId('user-123', 10, lastKey);

      expect(result.items).toHaveLength(1);
      expect(result.lastKey).toEqual(lastEvaluatedKey);

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            IndexName: 'UserIndex',
            Limit: 10,
            ExclusiveStartKey: lastKey,
          }),
        })
      );
    });

    it('保有株式が存在しない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      const result = await repository.getByUserId('user-999');

      expect(result.items).toEqual([]);
      expect(result.lastKey).toBeUndefined();
    });

    it('Items が undefined の場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getByUserId('user-999');

      expect(result.items).toEqual([]);
      expect(result.lastKey).toBeUndefined();
    });
  });

  describe('getById', () => {
    it('データベースエラー時にエラーをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('指定したユーザーIDとティッカーIDの保有株式を取得できる', async () => {
      const mockHolding = {
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
        Item: mockHolding,
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

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'USER#user-123',
              SK: 'HOLDING#NSDQ:AAPL',
            },
          }),
        })
      );
    });

    it('存在しない保有株式の場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getById('user-999', 'NSDQ:NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('データベースエラー時にエラーをスローする', async () => {
      const holdingData = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
      };

      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.create(holdingData)).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('新しい保有株式を作成できる', async () => {
      const holdingData = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
      };

      const mockNow = 1704067200000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.create(holdingData);

      expect(result).toEqual({
        ...holdingData,
        CreatedAt: mockNow,
        UpdatedAt: mockNow,
      });

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
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
              CreatedAt: mockNow,
              UpdatedAt: mockNow,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        })
      );
    });

    it('重複する保有株式の場合はHoldingAlreadyExistsErrorがスローされる', async () => {
      const holdingData = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
      };

      const conditionalCheckError = new Error('ConditionalCheckFailedException');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.create(holdingData)).rejects.toThrow(HoldingAlreadyExistsError);
    });
  });

  describe('update', () => {
    it('データベースエラー時にエラーをスローする', async () => {
      const existingHolding = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認) - 成功
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          ...existingHolding,
        },
        $metadata: {},
      });

      // update - エラー
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.update('user-123', 'NSDQ:AAPL', { Quantity: 15.0 })).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('保有株式のQuantityを更新できる', async () => {
      const existingHolding = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const updatedHolding = {
        ...existingHolding,
        Quantity: 15.0,
        UpdatedAt: 1704153600000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          ...existingHolding,
        },
        $metadata: {},
      });

      // update
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      // getById (更新後の取得)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          ...updatedHolding,
        },
        $metadata: {},
      });

      const mockNow = 1704153600000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await repository.update('user-123', 'NSDQ:AAPL', { Quantity: 15.0 });

      expect(result.Quantity).toBe(15.0);
      expect(result.UpdatedAt).toBe(mockNow);

      expect(mockDocClient.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'USER#user-123',
              SK: 'HOLDING#NSDQ:AAPL',
            },
            UpdateExpression: 'SET #quantity = :quantity, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#quantity': 'Quantity',
              '#updatedAt': 'UpdatedAt',
            },
            ExpressionAttributeValues: {
              ':quantity': 15.0,
              ':updatedAt': mockNow,
            },
            ConditionExpression: 'attribute_exists(PK)',
          }),
        })
      );
    });

    it('保有株式の複数フィールドを更新できる', async () => {
      const existingHolding = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const updatedHolding = {
        ...existingHolding,
        Quantity: 15.0,
        AveragePrice: 160.0,
        Currency: 'JPY',
        UpdatedAt: 1704153600000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          ...existingHolding,
        },
        $metadata: {},
      });

      // update
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      // getById (更新後の取得)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          ...updatedHolding,
        },
        $metadata: {},
      });

      const mockNow = 1704153600000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await repository.update('user-123', 'NSDQ:AAPL', {
        Quantity: 15.0,
        AveragePrice: 160.0,
        Currency: 'JPY',
      });

      expect(result.Quantity).toBe(15.0);
      expect(result.AveragePrice).toBe(160.0);
      expect(result.Currency).toBe('JPY');
      expect(result.UpdatedAt).toBe(mockNow);
    });

    it('存在しない保有株式の場合はHoldingNotFoundErrorをスロー', async () => {
      // getById (存在確認) - Item がない場合
      mockDocClient.send.mockResolvedValueOnce({
        Item: undefined,
        $metadata: {},
      });

      await expect(
        repository.update('user-999', 'NSDQ:NONEXISTENT', { Quantity: 10.0 })
      ).rejects.toThrow(HoldingNotFoundError);
    });

    it('更新するフィールドが指定されていない場合はInvalidHoldingDataErrorをスロー', async () => {
      const existingHolding = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          ...existingHolding,
        },
        $metadata: {},
      });

      await expect(repository.update('user-123', 'NSDQ:AAPL', {})).rejects.toThrow(
        InvalidHoldingDataError
      );
    });
  });

  describe('delete', () => {
    it('データベースエラー時にエラーをスローする', async () => {
      const existingHolding = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認) - 成功
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          ...existingHolding,
        },
        $metadata: {},
      });

      // delete - エラー
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.delete('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('保有株式を削除できる', async () => {
      const existingHolding = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          GSI1PK: 'user-123',
          GSI1SK: 'Holding#NSDQ:AAPL',
          ...existingHolding,
        },
        $metadata: {},
      });

      // delete
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.delete('user-123', 'NSDQ:AAPL');

      expect(mockDocClient.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'USER#user-123',
              SK: 'HOLDING#NSDQ:AAPL',
            },
            ConditionExpression: 'attribute_exists(PK)',
          }),
        })
      );
    });

    it('存在しない保有株式の場合はHoldingNotFoundErrorをスロー', async () => {
      // getById (存在確認) - Item がない場合
      mockDocClient.send.mockResolvedValueOnce({
        Item: undefined,
        $metadata: {},
      });

      await expect(repository.delete('user-999', 'NSDQ:NONEXISTENT')).rejects.toThrow(
        HoldingNotFoundError
      );
    });
  });

  describe('mapDynamoDBItemToHolding (via getById)', () => {
    it('UserIDが不正な場合はInvalidHoldingDataErrorをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          UserID: '', // 不正: 空文字列
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Quantity: 10.5,
          AveragePrice: 150.25,
          Currency: 'USD',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidHoldingDataError
      );
    });

    it('TickerIDが不正な場合はInvalidHoldingDataErrorをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          UserID: 'user-123',
          TickerID: 123, // 不正: 数値
          ExchangeID: 'NASDAQ',
          Quantity: 10.5,
          AveragePrice: 150.25,
          Currency: 'USD',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidHoldingDataError
      );
    });

    it('ExchangeIDが不正な場合はInvalidHoldingDataErrorをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: null, // 不正: null
          Quantity: 10.5,
          AveragePrice: 150.25,
          Currency: 'USD',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidHoldingDataError
      );
    });

    it('Quantityが不正な場合はInvalidHoldingDataErrorをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Quantity: '10.5', // 不正: 文字列
          AveragePrice: 150.25,
          Currency: 'USD',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidHoldingDataError
      );
    });

    it('AveragePriceが不正な場合はInvalidHoldingDataErrorをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Quantity: 10.5,
          AveragePrice: undefined, // 不正: undefined
          Currency: 'USD',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidHoldingDataError
      );
    });

    it('Currencyが不正な場合はInvalidHoldingDataErrorをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Quantity: 10.5,
          AveragePrice: 150.25,
          Currency: '', // 不正: 空文字列
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidHoldingDataError
      );
    });

    it('CreatedAtが不正な場合はInvalidHoldingDataErrorをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Quantity: 10.5,
          AveragePrice: 150.25,
          Currency: 'USD',
          CreatedAt: '1704067200000', // 不正: 文字列
          UpdatedAt: 1704067200000,
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidHoldingDataError
      );
    });

    it('UpdatedAtが不正な場合はInvalidHoldingDataErrorをスロー', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'HOLDING#NSDQ:AAPL',
          Type: 'Holding',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Quantity: 10.5,
          AveragePrice: 150.25,
          Currency: 'USD',
          CreatedAt: 1704067200000,
          UpdatedAt: null, // 不正: null
        },
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        InvalidHoldingDataError
      );
    });
  });
});
