/**
 * Unit tests for hourly batch processing
 */

import { handler } from '../../src/hourly.js';
import type { ScheduledEvent } from '../../src/hourly.js';
import * as awsClients from '../../src/lib/aws-clients.js';
import * as webPushClient from '../../src/lib/web-push-client.js';
import type { ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { DynamoDBAlertRepository, DynamoDBExchangeRepository } from '@nagiyu/stock-tracker-core';
import * as alertEvaluator from '@nagiyu/stock-tracker-core';
import * as tradingHoursChecker from '@nagiyu/stock-tracker-core';
import * as tradingviewClient from '@nagiyu/stock-tracker-core';
import type { Alert, Exchange } from '@nagiyu/stock-tracker-core';

// モックの設定
jest.mock('../../src/lib/aws-clients.js');
jest.mock('../../src/lib/web-push-client.js');
jest.mock('@nagiyu/stock-tracker-core', () => ({
  ...jest.requireActual('@nagiyu/stock-tracker-core'),
  DynamoDBAlertRepository: jest.fn(),
  DynamoDBExchangeRepository: jest.fn(),
  evaluateAlert: jest.fn(),
  isTradingHours: jest.fn(),
  getCurrentPrice: jest.fn(),
}));

describe('hourly batch handler', () => {
  let mockDocClient: unknown;
  let mockAlertRepo: jest.Mocked<DynamoDBAlertRepository>;
  let mockExchangeRepo: jest.Mocked<ExchangeRepository>;
  let mockEvent: ScheduledEvent;

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();

    // Mock DynamoDB Document Client
    mockDocClient = {};
    (awsClients.getDynamoDBDocumentClient as jest.Mock).mockReturnValue(mockDocClient);
    (awsClients.getTableName as jest.Mock).mockReturnValue('test-table');

    // Mock repositories
    mockAlertRepo = {
      getByFrequency: jest.fn(),
      getById: jest.fn(),
      getByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBAlertRepository>;

    mockExchangeRepo = {
      getById: jest.fn(),
      getAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ExchangeRepository>;

    (DynamoDBAlertRepository as jest.Mock).mockImplementation(() => mockAlertRepo);
    (DynamoDBExchangeRepository as jest.Mock).mockImplementation(() => mockExchangeRepo);

    // Mock event
    mockEvent = {
      version: '0',
      id: 'test-event-id',
      'detail-type': 'Scheduled Event',
      source: 'aws.events',
      account: '123456789012',
      time: '2024-01-15T10:00:00Z',
      region: 'ap-northeast-1',
      resources: ['arn:aws:events:ap-northeast-1:123456789012:rule/test'],
      detail: {},
    };

    // Mock environment variables
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  });

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  describe('正常系: アラート条件達成時に通知を送信', () => {
    it('有効なアラートの条件が達成された場合、Web Push 通知を送信する', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
        SubscriptionKeysP256dh: 'test-p256dh',
        SubscriptionKeysAuth: 'test-auth',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
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

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      (tradingviewClient.getCurrentPrice as jest.Mock).mockResolvedValue(205.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (webPushClient.sendNotification as jest.Mock).mockResolvedValue(true);
      (webPushClient.createAlertNotificationPayload as jest.Mock).mockReturnValue({
        title: 'Test Alert',
        body: 'Test body',
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(mockAlertRepo.getByFrequency).toHaveBeenCalledWith('HOURLY_LEVEL');
      expect(mockExchangeRepo.getById).toHaveBeenCalledWith('NASDAQ');
      expect(tradingHoursChecker.isTradingHours).toHaveBeenCalledWith(
        mockExchange,
        expect.any(Number)
      );
      expect(tradingviewClient.getCurrentPrice).toHaveBeenCalledWith('NSDQ:AAPL');
      expect(alertEvaluator.evaluateAlert).toHaveBeenCalledWith(mockAlert, 205.0);
      expect(webPushClient.sendNotification).toHaveBeenCalledWith(mockAlert, {
        title: 'Test Alert',
        body: 'Test body',
      });

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(1);
      expect(body.statistics.processedAlerts).toBe(1);
      expect(body.statistics.conditionsMet).toBe(1);
      expect(body.statistics.notificationsSent).toBe(1);
    });
  });

  describe('正常系: Enabled=false のアラートをスキップ', () => {
    it('無効化されたアラートは処理をスキップする', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: false, // 無効化
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
        SubscriptionKeysP256dh: 'test-p256dh',
        SubscriptionKeysAuth: 'test-auth',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(mockExchangeRepo.getById).not.toHaveBeenCalled();
      expect(tradingviewClient.getCurrentPrice).not.toHaveBeenCalled();
      expect(webPushClient.sendNotification).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(1);
      expect(body.statistics.processedAlerts).toBe(1);
      expect(body.statistics.skippedDisabled).toBe(1);
      expect(body.statistics.notificationsSent).toBe(0);
    });
  });

  describe('正常系: 取引時間外はアラートを抑制', () => {
    it('取引時間外の場合は通知を送信しない', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
        SubscriptionKeysP256dh: 'test-p256dh',
        SubscriptionKeysAuth: 'test-auth',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
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

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(tradingviewClient.getCurrentPrice).not.toHaveBeenCalled();
      expect(webPushClient.sendNotification).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.skippedOffHours).toBe(1);
      expect(body.statistics.notificationsSent).toBe(0);
    });
  });

  describe('正常系: 条件未達成の場合は通知しない', () => {
    it('アラート条件が未達成の場合は通知を送信しない', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
        SubscriptionKeysP256dh: 'test-p256dh',
        SubscriptionKeysAuth: 'test-auth',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
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

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      (tradingviewClient.getCurrentPrice as jest.Mock).mockResolvedValue(195.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(false); // 条件未達成

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(webPushClient.sendNotification).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.conditionsMet).toBe(0);
      expect(body.statistics.notificationsSent).toBe(0);
    });
  });

  describe('正常系: 空のアラートリスト', () => {
    it('アラートが0件の場合、正常に完了する', async () => {
      // Arrange
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [] });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(mockExchangeRepo.getById).not.toHaveBeenCalled();
      expect(tradingviewClient.getCurrentPrice).not.toHaveBeenCalled();
      expect(webPushClient.sendNotification).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(0);
      expect(body.statistics.processedAlerts).toBe(0);
    });
  });

  describe('異常系: TradingView API エラー', () => {
    it('TradingView API がエラーを返した場合、エラーをログに記録して継続', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
        SubscriptionKeysP256dh: 'test-p256dh',
        SubscriptionKeysAuth: 'test-auth',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
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

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      (tradingviewClient.getCurrentPrice as jest.Mock).mockRejectedValue(
        new Error('TradingView API タイムアウト')
      );

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200); // バッチ全体は成功
      expect(webPushClient.sendNotification).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.errors).toBe(1);
      expect(body.statistics.notificationsSent).toBe(0);
    });
  });

  describe('異常系: Exchange が存在しない', () => {
    it('Exchange が見つからない場合、エラーをログに記録して継続', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'INVALID',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
        SubscriptionKeysP256dh: 'test-p256dh',
        SubscriptionKeysAuth: 'test-auth',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(null); // Exchange が存在しない

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(tradingviewClient.getCurrentPrice).not.toHaveBeenCalled();
      expect(webPushClient.sendNotification).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.errors).toBe(1);
    });
  });

  describe('異常系: DynamoDB 接続エラー', () => {
    it('DynamoDB 接続エラーが発生した場合、500 エラーを返す', async () => {
      // Arrange
      mockAlertRepo.getByFrequency.mockRejectedValue(new Error('DynamoDB 接続エラー'));

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('エラーが発生しました');
      expect(body.error).toContain('DynamoDB 接続エラー');
    });
  });

  describe('異常系: 複数アラートの混在ケース', () => {
    it('一部のアラートでエラーが発生しても、他のアラートの処理を継続する', async () => {
      // Arrange
      const mockAlert1: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test1',
        SubscriptionKeysP256dh: 'test-p256dh-1',
        SubscriptionKeysAuth: 'test-auth-1',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      const mockAlert2: Alert = {
        AlertID: 'alert-2',
        UserID: 'user-2',
        TickerID: 'NYSE:TSLA',
        ExchangeID: 'NYSE',
        Mode: 'Buy',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test2',
        SubscriptionKeysP256dh: 'test-p256dh-2',
        SubscriptionKeysAuth: 'test-auth-2',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
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

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert1, mockAlert2] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      // alert-1: エラー発生
      (tradingviewClient.getCurrentPrice as jest.Mock)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(145.0);

      // alert-2: 正常処理
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (webPushClient.sendNotification as jest.Mock).mockResolvedValue(true);
      (webPushClient.createAlertNotificationPayload as jest.Mock).mockReturnValue({
        title: 'Test Alert',
        body: 'Test body',
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(2);
      expect(body.statistics.processedAlerts).toBe(2);
      expect(body.statistics.errors).toBe(1); // alert-1 のエラー
      expect(body.statistics.notificationsSent).toBe(1); // alert-2 の通知
    });
  });

  describe('正常系: 複数条件（範囲内）アラート', () => {
    it('範囲内アラート（AND）の条件が達成された場合、Web Push 通知を送信する', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 110.0 },
        ],
        LogicalOperator: 'AND',
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
        SubscriptionKeysP256dh: 'test-p256dh',
        SubscriptionKeysAuth: 'test-auth',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
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

      mockAlertRepo.getByFrequency.mockResolvedValue({
        items: [mockAlert],
        nextCursor: undefined,
        count: 1,
      });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      (tradingviewClient.getCurrentPrice as jest.Mock).mockResolvedValue(105.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (webPushClient.sendNotification as jest.Mock).mockResolvedValue(true);
      (webPushClient.createAlertNotificationPayload as jest.Mock).mockReturnValue({
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $105.00 が範囲 $100.00〜$110.00 内になりました',
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(alertEvaluator.evaluateAlert).toHaveBeenCalledWith(mockAlert, 105.0);
      expect(webPushClient.createAlertNotificationPayload).toHaveBeenCalledWith(mockAlert, 105.0);
      expect(webPushClient.sendNotification).toHaveBeenCalledWith(mockAlert, {
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $105.00 が範囲 $100.00〜$110.00 内になりました',
      });

      const body = JSON.parse(response.body);
      expect(body.statistics.conditionsMet).toBe(1);
      expect(body.statistics.notificationsSent).toBe(1);
    });
  });

  describe('正常系: 複数条件（LogicalOperator が undefined）アラート', () => {
    it('LogicalOperator が未指定の場合、デフォルトで AND として扱い通知を送信する', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 110.0 },
        ],
        // LogicalOperator は未指定（デフォルトで AND になる）
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
        SubscriptionKeysP256dh: 'test-p256dh',
        SubscriptionKeysAuth: 'test-auth',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
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

      mockAlertRepo.getByFrequency.mockResolvedValue({
        items: [mockAlert],
        nextCursor: undefined,
        count: 1,
      });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      (tradingviewClient.getCurrentPrice as jest.Mock).mockResolvedValue(105.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (webPushClient.sendNotification as jest.Mock).mockResolvedValue(true);
      (webPushClient.createAlertNotificationPayload as jest.Mock).mockReturnValue({
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $105.00 が範囲 $100.00〜$110.00 内になりました',
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(alertEvaluator.evaluateAlert).toHaveBeenCalledWith(mockAlert, 105.0);
      expect(webPushClient.createAlertNotificationPayload).toHaveBeenCalledWith(mockAlert, 105.0);
      expect(webPushClient.sendNotification).toHaveBeenCalledWith(mockAlert, {
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $105.00 が範囲 $100.00〜$110.00 内になりました',
      });

      const body = JSON.parse(response.body);
      expect(body.statistics.conditionsMet).toBe(1);
      expect(body.statistics.notificationsSent).toBe(1);
    });
  });

  describe('正常系: 複数条件（範囲外）アラート', () => {
    it('範囲外アラート（OR）の条件が達成された場合、Web Push 通知を送信する', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'lte', value: 90.0 },
          { field: 'price', operator: 'gte', value: 120.0 },
        ],
        LogicalOperator: 'OR',
        SubscriptionEndpoint: 'https://fcm.googleapis.com/fcm/send/test',
        SubscriptionKeysP256dh: 'test-p256dh',
        SubscriptionKeysAuth: 'test-auth',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
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

      mockAlertRepo.getByFrequency.mockResolvedValue({
        items: [mockAlert],
        nextCursor: undefined,
        count: 1,
      });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      (tradingviewClient.getCurrentPrice as jest.Mock).mockResolvedValue(85.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (webPushClient.sendNotification as jest.Mock).mockResolvedValue(true);
      (webPushClient.createAlertNotificationPayload as jest.Mock).mockReturnValue({
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $85.00 が範囲外（$90.00 以下 または $120.00 以上）になりました',
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(alertEvaluator.evaluateAlert).toHaveBeenCalledWith(mockAlert, 85.0);
      expect(webPushClient.createAlertNotificationPayload).toHaveBeenCalledWith(mockAlert, 85.0);
      expect(webPushClient.sendNotification).toHaveBeenCalledWith(mockAlert, {
        title: '売りアラート: NSDQ:AAPL',
        body: '現在価格 $85.00 が範囲外（$90.00 以下 または $120.00 以上）になりました',
      });

      const body = JSON.parse(response.body);
      expect(body.statistics.conditionsMet).toBe(1);
      expect(body.statistics.notificationsSent).toBe(1);
    });
  });
});
