/**
 * Stock Tracker Core - DynamoDB Alert Repository Unit Tests
 *
 * DynamoDBAlertRepositoryのユニットテスト
 */

import { DynamoDBAlertRepository } from '../../../src/repositories/dynamodb-alert.repository.js';
import { EntityAlreadyExistsError, EntityNotFoundError, DatabaseError } from '@nagiyu/aws';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreateAlertInput } from '../../../src/entities/alert.entity.js';

describe('DynamoDBAlertRepository', () => {
  let repository: DynamoDBAlertRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBAlertRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('新しいアラートを作成できる', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.AlertID).toBeDefined();
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('同じPK/SKのアラートが既に存在する場合はEntityAlreadyExistsErrorをスローする', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const input: CreateAlertInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
      };

      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getById', () => {
    it('存在するアラートを取得できる', async () => {
      const mockItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-123',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-123',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-123',
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockItem });

      const result = await repository.getById('user-123', 'alert-123');

      expect(result).toMatchObject({
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        Mode: 'Buy',
      });
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないアラートの場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('user-123', 'alert-notfound');

      expect(result).toBeNull();
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getById('user-123', 'alert-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByUserId', () => {
    it('ユーザーのアラート一覧を取得できる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          GSI1PK: 'user-123',
          GSI1SK: 'Alert#alert-1',
          GSI2PK: 'ALERT#MINUTE_LEVEL',
          GSI2SK: 'user-123#alert-1',
          AlertID: 'alert-1',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Mode: 'Buy',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          SubscriptionEndpoint: 'https://example.com/push',
          SubscriptionKeysP256dh: 'p256dh-key',
          SubscriptionKeysAuth: 'auth-secret',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
        {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-2',
          Type: 'Alert',
          GSI1PK: 'user-123',
          GSI1SK: 'Alert#alert-2',
          GSI2PK: 'ALERT#HOURLY_LEVEL',
          GSI2SK: 'user-123#alert-2',
          AlertID: 'alert-2',
          UserID: 'user-123',
          TickerID: 'NSDQ:NVDA',
          ExchangeID: 'NASDAQ',
          Mode: 'Sell',
          Frequency: 'HOURLY_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'gte', value: 500.0 }],
          SubscriptionEndpoint: 'https://example.com/push',
          SubscriptionKeysP256dh: 'p256dh-key',
          SubscriptionKeysAuth: 'auth-secret',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
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
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('該当するアラートがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      const result = await repository.getByUserId('user-notfound');

      expect(result.items).toHaveLength(0);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getByUserId('user-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByFrequency', () => {
    it('頻度ごとのアラート一覧を取得できる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          GSI1PK: 'user-123',
          GSI1SK: 'Alert#alert-1',
          GSI2PK: 'ALERT#MINUTE_LEVEL',
          GSI2SK: 'user-123#alert-1',
          AlertID: 'alert-1',
          UserID: 'user-123',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Mode: 'Buy',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          SubscriptionEndpoint: 'https://example.com/push',
          SubscriptionKeysP256dh: 'p256dh-key',
          SubscriptionKeysAuth: 'auth-secret',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockItems,
        Count: 1,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].Frequency).toBe('MINUTE_LEVEL');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('該当するアラートがない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(0);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.getByFrequency('MINUTE_LEVEL')).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('アラートを更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-123',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-123',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-123',
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: false,
        ConditionList: [{ field: 'price', operator: 'lte', value: 140.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'p256dh-key',
        SubscriptionKeysAuth: 'auth-secret',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067300000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('user-123', 'alert-123', {
        Enabled: false,
        ConditionList: [{ field: 'price', operator: 'lte', value: 140.0 }],
      });

      expect(result.Enabled).toBe(false);
      expect(result.ConditionList[0].value).toBe(140.0);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないアラートを更新しようとするとEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(
        repository.update('user-123', 'alert-notfound', { Enabled: false })
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('更新するフィールドがない場合はDatabaseErrorをスローする', async () => {
      await expect(repository.update('user-123', 'alert-123', {})).rejects.toThrow(DatabaseError);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.update('user-123', 'alert-123', { Enabled: false })).rejects.toThrow(
        DatabaseError
      );
    });

    it('複数のフィールドを同時に更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-123',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-123',
        GSI2PK: 'ALERT#HOURLY_LEVEL',
        GSI2SK: 'user-123#alert-123',
        AlertID: 'alert-123',
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 500.0 }],
        SubscriptionEndpoint: 'https://new.example.com/push',
        SubscriptionKeysP256dh: 'new-p256dh-key',
        SubscriptionKeysAuth: 'new-auth-secret',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067400000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockUpdatedItem,
      });

      const result = await repository.update('user-123', 'alert-123', {
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        SubscriptionEndpoint: 'https://new.example.com/push',
        SubscriptionKeysP256dh: 'new-p256dh-key',
        SubscriptionKeysAuth: 'new-auth-secret',
      });

      expect(result.TickerID).toBe('NSDQ:NVDA');
      expect(result.Mode).toBe('Sell');
      expect(result.Frequency).toBe('HOURLY_LEVEL');
      expect(result.SubscriptionEndpoint).toBe('https://new.example.com/push');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('Attributesが存在しない場合はEntityNotFoundErrorをスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: undefined,
      });

      await expect(repository.update('user-123', 'alert-123', { Enabled: false })).rejects.toThrow(
        EntityNotFoundError
      );
    });
  });

  describe('delete', () => {
    it('アラートを削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.delete('user-123', 'alert-123');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('存在しないアラートを削除しようとするとEntityNotFoundErrorをスローする', async () => {
      const conditionalCheckError = new Error('Conditional check failed');
      conditionalCheckError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalCheckError);

      await expect(repository.delete('user-123', 'alert-notfound')).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      const dbError = new Error('Database connection failed');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.delete('user-123', 'alert-123')).rejects.toThrow(DatabaseError);
    });
  });
});
