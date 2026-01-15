/**
 * Stock Tracker Core - Exchange Repository Unit Tests
 *
 * ExchangeRepositoryのユニットテスト
 */

import {
  ExchangeRepository,
  ExchangeNotFoundError,
  InvalidExchangeDataError,
  ExchangeAlreadyExistsError,
} from '../../../src/repositories/exchange.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

describe('ExchangeRepository', () => {
  let repository: ExchangeRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new ExchangeRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAll', () => {
    it('全取引所を取得できる', async () => {
      const mockExchanges = [
        {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NASDAQ',
          Name: 'NASDAQ Stock Market',
          Key: 'NSDQ',
          Timezone: 'America/New_York',
          Start: '04:00',
          End: '20:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        {
          PK: 'EXCHANGE#NYSE',
          SK: 'METADATA',
          Type: 'Exchange',
          ExchangeID: 'NYSE',
          Name: 'New York Stock Exchange',
          Key: 'NYSE',
          Timezone: 'America/New_York',
          Start: '04:00',
          End: '20:00',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockExchanges,
        $metadata: {},
      });

      const result = await repository.getAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
      expect(result[1]).toEqual({
        ExchangeID: 'NYSE',
        Name: 'New York Stock Exchange',
        Key: 'NYSE',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            FilterExpression: '#type = :type',
            ExpressionAttributeNames: {
              '#type': 'Type',
            },
            ExpressionAttributeValues: {
              ':type': 'Exchange',
            },
          }),
        })
      );
    });

    it('取引所が存在しない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      const result = await repository.getAll();

      expect(result).toEqual([]);
    });

    it('Items が undefined の場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('指定した取引所IDの取引所を取得できる', async () => {
      const mockExchange = {
        PK: 'EXCHANGE#NASDAQ',
        SK: 'METADATA',
        Type: 'Exchange',
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockExchange,
        $metadata: {},
      });

      const result = await repository.getById('NASDAQ');

      expect(result).toEqual({
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'EXCHANGE#NASDAQ',
              SK: 'METADATA',
            },
          }),
        })
      );
    });

    it('存在しない取引所IDの場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getById('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('新しい取引所を作成できる', async () => {
      const exchangeData = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const mockNow = 1704067200000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.create(exchangeData);

      expect(result).toEqual({
        ...exchangeData,
        CreatedAt: mockNow,
        UpdatedAt: mockNow,
      });

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Item: {
              PK: 'EXCHANGE#NASDAQ',
              SK: 'METADATA',
              Type: 'Exchange',
              ExchangeID: 'NASDAQ',
              Name: 'NASDAQ Stock Market',
              Key: 'NSDQ',
              Timezone: 'America/New_York',
              Start: '04:00',
              End: '20:00',
              CreatedAt: mockNow,
              UpdatedAt: mockNow,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        })
      );
    });

    it('重複する取引所IDの場合はExchangeAlreadyExistsErrorがスローされる', async () => {
      const exchangeData = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const conditionalCheckError = new Error('ConditionalCheckFailedException');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.create(exchangeData)).rejects.toThrow(ExchangeAlreadyExistsError);
    });
  });

  describe('update', () => {
    it('取引所の名前を更新できる', async () => {
      const existingExchange = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const updatedExchange = {
        ...existingExchange,
        Name: 'NASDAQ Updated',
        UpdatedAt: 1704153600000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ...existingExchange,
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
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ...updatedExchange,
        },
        $metadata: {},
      });

      const mockNow = 1704153600000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await repository.update('NASDAQ', { Name: 'NASDAQ Updated' });

      expect(result.Name).toBe('NASDAQ Updated');
      expect(result.UpdatedAt).toBe(mockNow);

      expect(mockDocClient.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'EXCHANGE#NASDAQ',
              SK: 'METADATA',
            },
            UpdateExpression: 'SET #name = :name, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#name': 'Name',
              '#updatedAt': 'UpdatedAt',
            },
            ExpressionAttributeValues: {
              ':name': 'NASDAQ Updated',
              ':updatedAt': mockNow,
            },
            ConditionExpression: 'attribute_exists(PK)',
          }),
        })
      );
    });

    it('取引所の複数フィールドを更新できる', async () => {
      const existingExchange = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const updatedExchange = {
        ...existingExchange,
        Name: 'NASDAQ Updated',
        Timezone: 'America/Chicago',
        Start: '05:00',
        End: '21:00',
        UpdatedAt: 1704153600000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ...existingExchange,
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
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ...updatedExchange,
        },
        $metadata: {},
      });

      const mockNow = 1704153600000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await repository.update('NASDAQ', {
        Name: 'NASDAQ Updated',
        Timezone: 'America/Chicago',
        Start: '05:00',
        End: '21:00',
      });

      expect(result.Name).toBe('NASDAQ Updated');
      expect(result.Timezone).toBe('America/Chicago');
      expect(result.Start).toBe('05:00');
      expect(result.End).toBe('21:00');
      expect(result.UpdatedAt).toBe(mockNow);
    });

    it('存在しない取引所IDの場合はExchangeNotFoundErrorをスロー', async () => {
      // getById (存在確認) - Item がない場合
      mockDocClient.send.mockResolvedValueOnce({
        Item: undefined,
        $metadata: {},
      });

      await expect(repository.update('NONEXISTENT', { Name: 'Updated' })).rejects.toThrow(
        ExchangeNotFoundError
      );
    });

    it('更新するフィールドが指定されていない場合はInvalidExchangeDataErrorをスロー', async () => {
      const existingExchange = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認) - 最初の呼び出し
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ...existingExchange,
        },
        $metadata: {},
      });

      await expect(repository.update('NASDAQ', {})).rejects.toThrow(InvalidExchangeDataError);
    });
  });

  describe('delete', () => {
    it('取引所を削除できる', async () => {
      const existingExchange = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'EXCHANGE#NASDAQ',
          SK: 'METADATA',
          Type: 'Exchange',
          ...existingExchange,
        },
        $metadata: {},
      });

      // delete
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.delete('NASDAQ');

      expect(mockDocClient.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'EXCHANGE#NASDAQ',
              SK: 'METADATA',
            },
            ConditionExpression: 'attribute_exists(PK)',
          }),
        })
      );
    });

    it('存在しない取引所IDの場合はExchangeNotFoundErrorをスロー', async () => {
      // getById (存在確認) - Item がない場合
      mockDocClient.send.mockResolvedValueOnce({
        Item: undefined,
        $metadata: {},
      });

      await expect(repository.delete('NONEXISTENT')).rejects.toThrow(ExchangeNotFoundError);
    });
  });
});
