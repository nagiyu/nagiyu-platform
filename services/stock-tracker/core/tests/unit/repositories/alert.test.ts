/**
 * Stock Tracker Core - Alert Repository Unit Tests
 *
 * AlertRepositoryのユニットテスト
 */

import {
  AlertRepository,
  AlertNotFoundError,
  InvalidAlertDataError,
} from '../../../src/repositories/alert.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Alert, AlertCondition } from '../../../src/types.js';

// crypto.randomUUID のモック
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

describe('AlertRepository', () => {
  let repository: AlertRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // DynamoDBDocumentClient のモック
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new AlertRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getByUserId', () => {
    it('ユーザーの全アラートを取得できる（GSI1使用）', async () => {
      const mockAlerts = [
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
          Mode: 'Sell',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
          SubscriptionEndpoint: 'https://example.com/push',
          SubscriptionKeysP256dh: 'test-p256dh-key',
          SubscriptionKeysAuth: 'test-auth-key',
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
          Mode: 'Buy',
          Frequency: 'HOURLY_LEVEL',
          Enabled: false,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          SubscriptionEndpoint: 'https://example.com/push',
          SubscriptionKeysP256dh: 'test-p256dh-key',
          SubscriptionKeysAuth: 'test-auth-key',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockAlerts,
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            IndexName: 'UserIndex',
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
            ExpressionAttributeNames: {
              '#pk': 'GSI1PK',
              '#sk': 'GSI1SK',
            },
            ExpressionAttributeValues: {
              ':pk': 'user-123',
              ':sk': 'Alert#',
            },
            Limit: 50,
          }),
        })
      );
    });

    it('ページネーションが正しく動作する', async () => {
      const lastKey = { PK: 'USER#user-123', SK: 'ALERT#alert-1' };

      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: lastKey,
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123', 10, lastKey);

      expect(result.lastKey).toEqual(lastKey);
      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Limit: 10,
            ExclusiveStartKey: lastKey,
          }),
        })
      );
    });

    it('アラートが存在しない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toEqual([]);
      expect(result.lastKey).toBeUndefined();
    });

    it('データベースエラーが発生した場合は例外をスロー', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByUserId('user-123')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });
  });

  describe('getByFrequency', () => {
    it('MINUTE_LEVEL のアラート一覧を取得できる（GSI2使用）', async () => {
      const mockAlerts = [
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
          Mode: 'Sell',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
          SubscriptionEndpoint: 'https://example.com/push',
          SubscriptionKeysP256dh: 'test-p256dh-key',
          SubscriptionKeysAuth: 'test-auth-key',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockAlerts,
        $metadata: {},
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result).toHaveLength(1);
      expect(result[0].Frequency).toBe('MINUTE_LEVEL');

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            IndexName: 'AlertIndex',
            KeyConditionExpression: '#pk = :pk',
            ExpressionAttributeNames: {
              '#pk': 'GSI2PK',
            },
            ExpressionAttributeValues: {
              ':pk': 'ALERT#MINUTE_LEVEL',
            },
          }),
        })
      );
    });

    it('HOURLY_LEVEL のアラート一覧を取得できる（GSI2使用）', async () => {
      const mockAlerts = [
        {
          PK: 'USER#user-456',
          SK: 'ALERT#alert-2',
          Type: 'Alert',
          GSI1PK: 'user-456',
          GSI1SK: 'Alert#alert-2',
          GSI2PK: 'ALERT#HOURLY_LEVEL',
          GSI2SK: 'user-456#alert-2',
          AlertID: 'alert-2',
          UserID: 'user-456',
          TickerID: 'NYSE:TSLA',
          ExchangeID: 'NYSE',
          Mode: 'Buy',
          Frequency: 'HOURLY_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          SubscriptionEndpoint: 'https://example.com/push',
          SubscriptionKeysP256dh: 'test-p256dh-key',
          SubscriptionKeysAuth: 'test-auth-key',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
        },
      ];

      mockDocClient.send.mockResolvedValueOnce({
        Items: mockAlerts,
        $metadata: {},
      });

      const result = await repository.getByFrequency('HOURLY_LEVEL');

      expect(result).toHaveLength(1);
      expect(result[0].Frequency).toBe('HOURLY_LEVEL');

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            ExpressionAttributeValues: {
              ':pk': 'ALERT#HOURLY_LEVEL',
            },
          }),
        })
      );
    });

    it('アラートが存在しない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [],
        $metadata: {},
      });

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result).toEqual([]);
    });

    it('データベースエラーが発生した場合は例外をスロー', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByFrequency('MINUTE_LEVEL')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });
  });

  describe('getById', () => {
    it('指定したアラートIDのアラートを取得できる', async () => {
      const mockAlert = {
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
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockAlert,
        $metadata: {},
      });

      const result = await repository.getById('user-123', 'alert-1');

      expect(result).toEqual({
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'USER#user-123',
              SK: 'ALERT#alert-1',
            },
          }),
        })
      );
    });

    it('存在しないアラートIDの場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.getById('user-123', 'nonexistent');

      expect(result).toBeNull();
    });

    it('データベースエラーが発生した場合は例外をスロー', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getById('user-123', 'alert-1')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });

    it('LogicalOperatorフィールドが正しくマッピングされる（OR条件）', async () => {
      const mockAlert = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-or',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-or',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-or',
        AlertID: 'alert-or',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'lte', value: 1.0 },
          { field: 'price', operator: 'gte', value: 10.0 },
        ],
        LogicalOperator: 'OR',
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockAlert,
        $metadata: {},
      });

      const result = await repository.getById('user-123', 'alert-or');

      expect(result).toEqual({
        AlertID: 'alert-or',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'lte', value: 1.0 },
          { field: 'price', operator: 'gte', value: 10.0 },
        ],
        LogicalOperator: 'OR',
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('LogicalOperatorフィールドが正しくマッピングされる（AND条件）', async () => {
      const mockAlert = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-and',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-and',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-and',
        AlertID: 'alert-and',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 200.0 },
        ],
        LogicalOperator: 'AND',
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockAlert,
        $metadata: {},
      });

      const result = await repository.getById('user-123', 'alert-and');

      expect(result).toEqual({
        AlertID: 'alert-and',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 200.0 },
        ],
        LogicalOperator: 'AND',
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
    });

    it('LogicalOperatorがない場合はundefinedとなる（後方互換性）', async () => {
      const mockAlert = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-single',
        Type: 'Alert',
        GSI1PK: 'user-123',
        GSI1SK: 'Alert#alert-single',
        GSI2PK: 'ALERT#MINUTE_LEVEL',
        GSI2SK: 'user-123#alert-single',
        AlertID: 'alert-single',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        // LogicalOperator なし
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: mockAlert,
        $metadata: {},
      });

      const result = await repository.getById('user-123', 'alert-single');

      expect(result).toEqual({
        AlertID: 'alert-single',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        // LogicalOperator なし
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      });
      expect(result?.LogicalOperator).toBeUndefined();
    });
  });

  describe('create', () => {
    it('新しいアラートを作成できる（AlertIDはUUID v4で自動生成）', async () => {
      const alertData: Omit<Alert, 'AlertID' | 'CreatedAt' | 'UpdatedAt'> = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
      };

      const mockNow = 1704067200000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      const result = await repository.create(alertData);

      expect(result).toEqual({
        ...alertData,
        AlertID: 'test-uuid-1234',
        CreatedAt: mockNow,
        UpdatedAt: mockNow,
      });

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Item: {
              PK: 'USER#user-123',
              SK: 'ALERT#test-uuid-1234',
              Type: 'Alert',
              GSI1PK: 'user-123',
              GSI1SK: 'Alert#test-uuid-1234',
              GSI2PK: 'ALERT#MINUTE_LEVEL',
              GSI2SK: 'user-123#test-uuid-1234',
              AlertID: 'test-uuid-1234',
              UserID: 'user-123',
              TickerID: 'NSDQ:AAPL',
              ExchangeID: 'NASDAQ',
              Mode: 'Sell',
              Frequency: 'MINUTE_LEVEL',
              Enabled: true,
              ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
              SubscriptionEndpoint: 'https://example.com/push',
              SubscriptionKeysP256dh: 'test-p256dh-key',
              SubscriptionKeysAuth: 'test-auth-key',
              CreatedAt: mockNow,
              UpdatedAt: mockNow,
            },
          }),
        })
      );
    });

    it('GSI2のキーが正しく設定される（バッチ処理用）', async () => {
      const alertData: Omit<Alert, 'AlertID' | 'CreatedAt' | 'UpdatedAt'> = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
      };

      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.create(alertData);

      expect(mockDocClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              GSI2PK: 'ALERT#HOURLY_LEVEL',
              GSI2SK: 'user-123#test-uuid-1234',
            }),
          }),
        })
      );
    });

    it('データベースエラーが発生した場合は例外をスロー', async () => {
      const alertData: Omit<Alert, 'AlertID' | 'CreatedAt' | 'UpdatedAt'> = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
      };

      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.create(alertData)).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });
  });

  describe('update', () => {
    it('アラートの有効/無効フラグを更新できる', async () => {
      const existingAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const updatedAlert: Alert = {
        ...existingAlert,
        Enabled: false,
        UpdatedAt: 1704153600000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...existingAlert,
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
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...updatedAlert,
        },
        $metadata: {},
      });

      const mockNow = 1704153600000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await repository.update('user-123', 'alert-1', { Enabled: false });

      expect(result.Enabled).toBe(false);
      expect(result.UpdatedAt).toBe(mockNow);

      // UpdateExpression format check - verify the correct fields are being updated
      const updateCall = mockDocClient.send.mock.calls[1][0];
      expect(updateCall.input.TableName).toBe(TABLE_NAME);
      expect(updateCall.input.Key).toEqual({
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
      });
      expect(updateCall.input.ConditionExpression).toBe('attribute_exists(PK)');

      // Verify UpdateExpression contains the correct updates (format may vary)
      expect(updateCall.input.UpdateExpression).toContain('SET');
      expect(updateCall.input.UpdateExpression).toMatch(/#updatedAt|#UpdatedAt/i);

      // Verify ExpressionAttributeNames maps to correct DynamoDB fields
      const attrNames = updateCall.input.ExpressionAttributeNames;
      const attrValues = updateCall.input.ExpressionAttributeValues;

      // Build reverse map: DynamoDB field name -> placeholder
      const fieldToPlaceholder: Record<string, string> = {};
      for (const [placeholder, fieldName] of Object.entries(attrNames)) {
        fieldToPlaceholder[fieldName as string] = placeholder;
      }

      // Find value placeholders by looking at the UpdateExpression
      // Common infrastructure uses #field0 -> :value0 pattern
      const enabledPlaceholder = fieldToPlaceholder['Enabled'];
      const updatedAtPlaceholder = fieldToPlaceholder['UpdatedAt'];

      expect(enabledPlaceholder).toBeDefined();
      expect(updatedAtPlaceholder).toBeDefined();

      // Match attribute name placeholders to value placeholders
      // Pattern: #fieldN corresponds to :valueN or #name corresponds to :name
      let enabledValue = undefined;
      let updatedAtValue = undefined;

      // Check both naming patterns
      if (enabledPlaceholder.startsWith('#field')) {
        const fieldNum = enabledPlaceholder.replace('#field', '');
        enabledValue = attrValues[`:value${fieldNum}`];
      } else {
        enabledValue = attrValues[enabledPlaceholder.replace('#', ':')];
      }

      if (updatedAtPlaceholder.startsWith('#field')) {
        const fieldNum = updatedAtPlaceholder.replace('#field', '');
        updatedAtValue = attrValues[`:value${fieldNum}`];
      } else {
        updatedAtValue = attrValues[updatedAtPlaceholder.replace('#', ':')];
      }

      expect(enabledValue).toBe(false);
      expect(updatedAtValue).toBe(mockNow);
    });

    it('アラートの条件を更新できる', async () => {
      const existingAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const newConditionList: AlertCondition[] = [
        { field: 'price', operator: 'gte', value: 250.0 },
      ];

      const updatedAlert: Alert = {
        ...existingAlert,
        ConditionList: newConditionList,
        UpdatedAt: 1704153600000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...existingAlert,
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
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...updatedAlert,
        },
        $metadata: {},
      });

      const mockNow = 1704153600000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await repository.update('user-123', 'alert-1', {
        ConditionList: newConditionList,
      });

      expect(result.ConditionList[0].value).toBe(250.0);
      expect(result.UpdatedAt).toBe(mockNow);
    });

    it('アラートの複数フィールドを更新できる', async () => {
      const existingAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const newConditionList: AlertCondition[] = [
        { field: 'price', operator: 'gte', value: 250.0 },
      ];

      const updatedAlert: Alert = {
        ...existingAlert,
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        ConditionList: newConditionList,
        SubscriptionEndpoint: 'https://new.example.com/push',
        SubscriptionKeysP256dh: 'new-p256dh-key',
        SubscriptionKeysAuth: 'new-auth-key',
        UpdatedAt: 1704153600000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...existingAlert,
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
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...updatedAlert,
        },
        $metadata: {},
      });

      const mockNow = 1704153600000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await repository.update('user-123', 'alert-1', {
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Mode: 'Buy',
        ConditionList: newConditionList,
        SubscriptionEndpoint: 'https://new.example.com/push',
        SubscriptionKeysP256dh: 'new-p256dh-key',
        SubscriptionKeysAuth: 'new-auth-key',
      });

      expect(result.TickerID).toBe('NSDQ:NVDA');
      expect(result.Mode).toBe('Buy');
      expect(result.ConditionList[0].value).toBe(250.0);
      expect(result.SubscriptionEndpoint).toBe('https://new.example.com/push');
      expect(result.SubscriptionKeysP256dh).toBe('new-p256dh-key');
      expect(result.SubscriptionKeysAuth).toBe('new-auth-key');
    });

    it('頻度を更新するとGSI2PKも更新される', async () => {
      const existingAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      const updatedAlert: Alert = {
        ...existingAlert,
        Frequency: 'HOURLY_LEVEL',
        UpdatedAt: 1704153600000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...existingAlert,
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
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          GSI2PK: 'ALERT#HOURLY_LEVEL',
          ...updatedAlert,
        },
        $metadata: {},
      });

      const mockNow = 1704153600000;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      await repository.update('user-123', 'alert-1', { Frequency: 'HOURLY_LEVEL' });

      // UpdateExpression format check - verify the correct fields are being updated
      const updateCall = mockDocClient.send.mock.calls[1][0];

      // Verify ExpressionAttributeNames maps to correct DynamoDB fields
      const attrNames = updateCall.input.ExpressionAttributeNames;
      const attrValues = updateCall.input.ExpressionAttributeValues;

      // Build reverse map: DynamoDB field name -> placeholder
      const fieldToPlaceholder: Record<string, string> = {};
      for (const [placeholder, fieldName] of Object.entries(attrNames)) {
        fieldToPlaceholder[fieldName as string] = placeholder;
      }

      const frequencyPlaceholder = fieldToPlaceholder['Frequency'];
      const gsi2pkPlaceholder = fieldToPlaceholder['GSI2PK'];
      const updatedAtPlaceholder = fieldToPlaceholder['UpdatedAt'];

      expect(frequencyPlaceholder).toBeDefined();
      expect(gsi2pkPlaceholder).toBeDefined();
      expect(updatedAtPlaceholder).toBeDefined();

      // Verify UpdateExpression contains all three updates
      expect(updateCall.input.UpdateExpression).toContain('SET');
      expect(updateCall.input.UpdateExpression).toMatch(/#updatedAt|#UpdatedAt/i);

      // Match attribute name placeholders to value placeholders
      let frequencyValue = undefined;
      let gsi2pkValue = undefined;
      let updatedAtValue = undefined;

      // Common infrastructure uses #fieldN -> :valueN pattern
      if (frequencyPlaceholder.startsWith('#field')) {
        const fieldNum = frequencyPlaceholder.replace('#field', '');
        frequencyValue = attrValues[`:value${fieldNum}`];
      } else {
        frequencyValue = attrValues[frequencyPlaceholder.replace('#', ':')];
      }

      if (gsi2pkPlaceholder.startsWith('#field')) {
        const fieldNum = gsi2pkPlaceholder.replace('#field', '');
        gsi2pkValue = attrValues[`:value${fieldNum}`];
      } else {
        gsi2pkValue = attrValues[gsi2pkPlaceholder.replace('#', ':')];
      }

      if (updatedAtPlaceholder.startsWith('#field')) {
        const fieldNum = updatedAtPlaceholder.replace('#field', '');
        updatedAtValue = attrValues[`:value${fieldNum}`];
      } else {
        updatedAtValue = attrValues[updatedAtPlaceholder.replace('#', ':')];
      }

      expect(frequencyValue).toBe('HOURLY_LEVEL');
      expect(gsi2pkValue).toBe('ALERT#HOURLY_LEVEL');
      expect(updatedAtValue).toBe(mockNow);
    });

    it('存在しないアラートIDの場合はAlertNotFoundErrorをスロー', async () => {
      // getById (存在確認) - Item がない場合
      mockDocClient.send.mockResolvedValueOnce({
        Item: undefined,
        $metadata: {},
      });

      await expect(
        repository.update('user-123', 'nonexistent', { Enabled: false })
      ).rejects.toThrow(AlertNotFoundError);
    });

    it('更新するフィールドが指定されていない場合はInvalidAlertDataErrorをスロー', async () => {
      const existingAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...existingAlert,
        },
        $metadata: {},
      });

      await expect(repository.update('user-123', 'alert-1', {})).rejects.toThrow(
        InvalidAlertDataError
      );
    });

    it('データベースエラーが発生した場合は例外をスロー', async () => {
      const existingAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...existingAlert,
        },
        $metadata: {},
      });

      // update でエラー
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.update('user-123', 'alert-1', { Enabled: false })).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });
  });

  describe('delete', () => {
    it('アラートを削除できる', async () => {
      const existingAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...existingAlert,
        },
        $metadata: {},
      });

      // delete
      mockDocClient.send.mockResolvedValueOnce({
        $metadata: {},
      });

      await repository.delete('user-123', 'alert-1');

      expect(mockDocClient.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLE_NAME,
            Key: {
              PK: 'USER#user-123',
              SK: 'ALERT#alert-1',
            },
            ConditionExpression: 'attribute_exists(PK)',
          }),
        })
      );
    });

    it('存在しないアラートIDの場合はAlertNotFoundErrorをスロー', async () => {
      // getById (存在確認) - Item がない場合
      mockDocClient.send.mockResolvedValueOnce({
        Item: undefined,
        $metadata: {},
      });

      await expect(repository.delete('user-123', 'nonexistent')).rejects.toThrow(
        AlertNotFoundError
      );
    });

    it('データベースエラーが発生した場合は例外をスロー', async () => {
      const existingAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      // getById (存在確認)
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ALERT#alert-1',
          Type: 'Alert',
          ...existingAlert,
        },
        $metadata: {},
      });

      // delete でエラー
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.delete('user-123', 'alert-1')).rejects.toThrow(
        'データベースエラーが発生しました'
      );
    });
  });

  describe('mapDynamoDBItemToAlert (間接的なテスト)', () => {
    it('不正なデータの場合はInvalidAlertDataErrorをスロー - AlertIDが空', async () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        Type: 'Alert',
        AlertID: '', // 空文字
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: invalidItem,
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'alert-1')).rejects.toThrow(
        InvalidAlertDataError
      );
    });

    it('不正なデータの場合はInvalidAlertDataErrorをスロー - Modeが不正', async () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        Type: 'Alert',
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Invalid', // 不正な値
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: invalidItem,
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'alert-1')).rejects.toThrow(
        InvalidAlertDataError
      );
    });

    it('不正なデータの場合はInvalidAlertDataErrorをスロー - Frequencyが不正', async () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        Type: 'Alert',
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'INVALID_LEVEL', // 不正な値
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: invalidItem,
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'alert-1')).rejects.toThrow(
        InvalidAlertDataError
      );
    });

    it('不正なデータの場合はInvalidAlertDataErrorをスロー - Enabledが不正', async () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        Type: 'Alert',
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: 'true', // 文字列（boolean ではない）
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: invalidItem,
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'alert-1')).rejects.toThrow(
        InvalidAlertDataError
      );
    });

    it('不正なデータの場合はInvalidAlertDataErrorをスロー - ConditionListが空配列', async () => {
      const invalidItem = {
        PK: 'USER#user-123',
        SK: 'ALERT#alert-1',
        Type: 'Alert',
        AlertID: 'alert-1',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [], // 空配列
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: invalidItem,
        $metadata: {},
      });

      await expect(repository.getById('user-123', 'alert-1')).rejects.toThrow(
        InvalidAlertDataError
      );
    });
  });
});
