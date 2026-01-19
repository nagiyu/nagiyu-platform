/**
 * Stock Tracker Batch - Minute Batch Unit Tests
 *
 * 1分間隔バッチ処理のユニットテスト
 * すべての依存をモック化してビジネスロジックのみをテスト
 */

// Core からの import を個別にモック（最初に定義）
const mockAlertRepository = {
  getByFrequency: jest.fn(),
};

const mockExchangeRepository = {
  getById: jest.fn(),
};

const mockEvaluateAlert = jest.fn();
const mockIsTradingHours = jest.fn();
const mockGetCurrentPrice = jest.fn();

// モジュールのモック化
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('web-push');
jest.mock('../../src/lib/logger.js');

jest.mock('@nagiyu/stock-tracker-core', () => ({
  AlertRepository: jest.fn(() => mockAlertRepository),
  ExchangeRepository: jest.fn(() => mockExchangeRepository),
  evaluateAlert: (...args: unknown[]) => mockEvaluateAlert(...args),
  isTradingHours: (...args: unknown[]) => mockIsTradingHours(...args),
  getCurrentPrice: (...args: unknown[]) => mockGetCurrentPrice(...args),
}));

// ハンドラのインポート（モック後）
import { handler, type ScheduledEvent } from '../../src/minute.js';

// モジュールのインポート（モック後）
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import webpush from 'web-push';
import type { Alert, Exchange } from '@nagiyu/stock-tracker-core';

describe('Minute Batch Handler', () => {
  // モックされた環境変数
  const originalEnv = process.env;

  // テストデータ
  const mockEvent: ScheduledEvent = {
    version: '0',
    id: 'test-event-id',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789012',
    time: '2024-01-15T10:00:00Z',
    region: 'us-east-1',
    resources: ['arn:aws:events:us-east-1:123456789012:rule/test-rule'],
    detail: {},
  };

  const mockExchange: Exchange = {
    ExchangeID: 'NASDAQ',
    Name: 'NASDAQ',
    Key: 'NSDQ',
    Timezone: 'America/New_York',
    Start: '04:00',
    End: '20:00',
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
  };

  const mockAlert: Alert = {
    AlertID: 'alert-123',
    UserID: 'user-456',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Mode: 'Sell',
    Frequency: 'MINUTE_LEVEL',
    Enabled: true,
    ConditionList: [
      {
        field: 'price',
        operator: 'gte',
        value: 200.0,
      },
    ],
    SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
    SubscriptionKeysP256dh: 'test-p256dh-key',
    SubscriptionKeysAuth: 'test-auth-key',
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
  };

  beforeEach(() => {
    // 環境変数を設定
    process.env = {
      ...originalEnv,
      TABLE_NAME: 'test-table',
      VAPID_PUBLIC_KEY: 'BKxMxS7QwKp3xLHtvMCKMpMhYP_JN1Z9PF4vL4dN8Cg',
      VAPID_PRIVATE_KEY: 'z1FJ_1Dp3kN4z5Q_vO2FN_7zN4Hv8Pq2O5_1L9N8Cg',
    };

    // モックをクリア
    jest.clearAllMocks();
    mockAlertRepository.getByFrequency.mockClear();
    mockExchangeRepository.getById.mockClear();
    mockEvaluateAlert.mockClear();
    mockIsTradingHours.mockClear();
    mockGetCurrentPrice.mockClear();

    // DynamoDB クライアントのモック
    (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue({});

    // webpush のモック
    (webpush.setVapidDetails as jest.Mock).mockReturnValue(undefined);
    (webpush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  describe('正常系', () => {
    it('アラートが条件を満たす場合、通知を送信する', async () => {
      // Arrange
      mockAlertRepository.getByFrequency.mockResolvedValue([mockAlert]);
      mockExchangeRepository.getById.mockResolvedValue(mockExchange);
      mockIsTradingHours.mockReturnValue(true);
      mockGetCurrentPrice.mockResolvedValue(205.0);
      mockEvaluateAlert.mockReturnValue(true);

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(mockAlertRepository.getByFrequency).toHaveBeenCalledWith('MINUTE_LEVEL');
      expect(mockExchangeRepository.getById).toHaveBeenCalledWith('NASDAQ');
      expect(mockIsTradingHours).toHaveBeenCalledWith(mockExchange, expect.any(Number));
      expect(mockGetCurrentPrice).toHaveBeenCalledWith('NSDQ:AAPL');
      expect(mockEvaluateAlert).toHaveBeenCalledWith(mockAlert, 205.0);
      expect(webpush.sendNotification).toHaveBeenCalled();

      const responseBody = JSON.parse(result.body);
      expect(responseBody.stats.totalAlerts).toBe(1);
      expect(responseBody.stats.conditionMet).toBe(1);
      expect(responseBody.stats.notificationsSent).toBe(1);
    });

    it('アラートが0件の場合、正常に完了する', async () => {
      // Arrange
      mockAlertRepository.getByFrequency.mockResolvedValue([]);

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(mockAlertRepository.getByFrequency).toHaveBeenCalledWith('MINUTE_LEVEL');
      expect(webpush.sendNotification).not.toHaveBeenCalled();

      const responseBody = JSON.parse(result.body);
      expect(responseBody.stats.totalAlerts).toBe(0);
    });
  });

  describe('エラーハンドリング', () => {
    it('TABLE_NAME が設定されていない場合、エラーを返す', async () => {
      // Arrange
      delete process.env.TABLE_NAME;

      // Act
      const result = await handler(mockEvent);

      // Assert
      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.message).toContain('エラーが発生しました');
      expect(responseBody.error).toContain('TABLE_NAME');
    });
  });
});
