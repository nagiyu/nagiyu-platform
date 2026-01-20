/**
 * Unit tests for daily batch processing
 */

import { handler } from '../../src/daily.js';
import type { ScheduledEvent } from '../../src/daily.js';
import * as awsClients from '../../src/lib/aws-clients.js';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Alert } from '@nagiyu/stock-tracker-core';

// モックの設定
jest.mock('../../src/lib/aws-clients.js');

describe('daily batch handler', () => {
  let mockDocClient: {
    send: jest.Mock;
  };
  let mockEvent: ScheduledEvent;

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();

    // Mock DynamoDB Document Client
    mockDocClient = {
      send: jest.fn(),
    };
    (awsClients.getDynamoDBDocumentClient as jest.Mock).mockReturnValue(mockDocClient);
    (awsClients.getTableName as jest.Mock).mockReturnValue('test-table');

    // Mock event
    mockEvent = {
      version: '0',
      id: 'test-event-id',
      'detail-type': 'Scheduled Event',
      source: 'aws.events',
      account: '123456789012',
      time: '2024-01-15T09:00:00Z',
      region: 'ap-northeast-1',
      resources: ['arn:aws:events:ap-northeast-1:123456789012:rule/test'],
      detail: {},
    };
  });

  describe('正常系: 有効なサブスクリプションのみが存在する場合', () => {
    it('すべてのサブスクリプションが有効な場合、統計情報を返す', async () => {
      // Arrange
      const mockAlerts: Alert[] = [
        {
          AlertID: 'alert-1',
          UserID: 'user-1',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Mode: 'Sell',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
          SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test1',
          SubscriptionKeysP256dh: 'test-p256dh-1',
          SubscriptionKeysAuth: 'test-auth-1',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
        {
          AlertID: 'alert-2',
          UserID: 'user-2',
          TickerID: 'NSDQ:NVDA',
          ExchangeID: 'NASDAQ',
          Mode: 'Buy',
          Frequency: 'HOURLY_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test2',
          SubscriptionKeysP256dh: 'test-p256dh-2',
          SubscriptionKeysAuth: 'test-auth-2',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
      ];

      mockDocClient.send.mockResolvedValue({
        Items: mockAlerts,
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('日次バッチ処理が正常に完了しました');
      expect(body.statistics.totalAlerts).toBe(2);
      expect(body.statistics.validSubscriptions).toBe(2);
      expect(body.statistics.invalidSubscriptions).toBe(0);

      // ScanCommandが正しく呼ばれたことを確認
      expect(mockDocClient.send).toHaveBeenCalledWith(expect.any(ScanCommand));
    });
  });

  describe('正常系: 無効なサブスクリプションが存在する場合', () => {
    it('無効なサブスクリプションを検出してログ出力する', async () => {
      // Arrange
      const mockAlerts: Alert[] = [
        // 有効なサブスクリプション
        {
          AlertID: 'alert-1',
          UserID: 'user-1',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Mode: 'Sell',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
          SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/valid',
          SubscriptionKeysP256dh: 'test-p256dh',
          SubscriptionKeysAuth: 'test-auth',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
        // 無効なサブスクリプション: Endpoint が空
        {
          AlertID: 'alert-2',
          UserID: 'user-2',
          TickerID: 'NSDQ:NVDA',
          ExchangeID: 'NASDAQ',
          Mode: 'Buy',
          Frequency: 'HOURLY_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
          SubscriptionEndpoint: '',
          SubscriptionKeysP256dh: 'test-p256dh',
          SubscriptionKeysAuth: 'test-auth',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
        // 無効なサブスクリプション: 不正なURL形式
        {
          AlertID: 'alert-3',
          UserID: 'user-3',
          TickerID: 'NSDQ:TSLA',
          ExchangeID: 'NASDAQ',
          Mode: 'Sell',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'gte', value: 300.0 }],
          SubscriptionEndpoint: 'invalid-url',
          SubscriptionKeysP256dh: 'test-p256dh',
          SubscriptionKeysAuth: 'test-auth',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
      ];

      mockDocClient.send.mockResolvedValue({
        Items: mockAlerts,
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(3);
      expect(body.statistics.validSubscriptions).toBe(1);
      expect(body.statistics.invalidSubscriptions).toBe(2);
    });
  });

  describe('正常系: アラートが存在しない場合', () => {
    it('アラートが0件の場合、統計情報を返す', async () => {
      // Arrange
      mockDocClient.send.mockResolvedValue({
        Items: [],
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(0);
      expect(body.statistics.validSubscriptions).toBe(0);
      expect(body.statistics.invalidSubscriptions).toBe(0);
    });
  });

  describe('異常系: DynamoDBエラー', () => {
    it('DynamoDBでエラーが発生した場合、500エラーを返す', async () => {
      // Arrange
      const dbError = new Error('DynamoDB Error');
      mockDocClient.send.mockRejectedValue(dbError);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('日次バッチ処理でエラーが発生しました');
      expect(body.error).toBe('DynamoDB Error');
    });
  });

  describe('エッジケース: サブスクリプションキーが空', () => {
    it('SubscriptionKeysP256dhが空の場合、無効と判定する', async () => {
      // Arrange
      const mockAlerts: Alert[] = [
        {
          AlertID: 'alert-1',
          UserID: 'user-1',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Mode: 'Sell',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
          SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
          SubscriptionKeysP256dh: '', // 空
          SubscriptionKeysAuth: 'test-auth',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
      ];

      mockDocClient.send.mockResolvedValue({
        Items: mockAlerts,
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.invalidSubscriptions).toBe(1);
    });

    it('SubscriptionKeysAuthが空の場合、無効と判定する', async () => {
      // Arrange
      const mockAlerts: Alert[] = [
        {
          AlertID: 'alert-1',
          UserID: 'user-1',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Mode: 'Sell',
          Frequency: 'MINUTE_LEVEL',
          Enabled: true,
          ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
          SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
          SubscriptionKeysP256dh: 'test-p256dh',
          SubscriptionKeysAuth: '', // 空
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
      ];

      mockDocClient.send.mockResolvedValue({
        Items: mockAlerts,
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.invalidSubscriptions).toBe(1);
    });
  });
});
