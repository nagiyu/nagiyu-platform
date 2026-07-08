/**
 * Unit tests for minute batch processing
 *
 * PriceSource ベースのルーティングを検証する（Unit 2b 対応）。
 * TradingView 経路（共有セッション最適化）と Finnhub 経路の両方を検証する。
 */

import { handler } from '../../src/minute.js';
import type { ScheduledEvent } from '../../src/minute.js';
import * as awsClients from '@nagiyu/aws';
import * as webPushClient from '../../src/lib/web-push-client.js';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import type { ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { DynamoDBAlertRepository, DynamoDBExchangeRepository } from '@nagiyu/stock-tracker-core';
import * as alertEvaluator from '@nagiyu/stock-tracker-core';
import * as tradingHoursChecker from '@nagiyu/stock-tracker-core';
import type { Alert, Exchange } from '@nagiyu/stock-tracker-core';

// TradingViewSession モックインスタンス（beforeEach で再生成）
let mockSession: { getCurrentPrice: jest.Mock; close: jest.Mock; getSessionId: jest.Mock };

// standalone getCurrentPrice モック（新規 WS リトライ用）
const mockGetCurrentPrice = jest.fn();

// FinnhubQuoteProvider モック（beforeEach で再生成）
let mockFinnhubGetCurrentPrice: jest.Mock;

// モックの設定
jest.mock('@nagiyu/aws');
jest.mock('../../src/lib/web-push-client.js');
jest.mock('@nagiyu/common/push', () => ({
  sendWebPushNotification: jest.fn(),
  getVapidConfig: jest.fn(),
}));
jest.mock('@nagiyu/stock-tracker-core', () => ({
  ...jest.requireActual('@nagiyu/stock-tracker-core'),
  DynamoDBAlertRepository: jest.fn(),
  DynamoDBExchangeRepository: jest.fn(),
  evaluateAlert: jest.fn(),
  isTradingHours: jest.fn(),
  TradingViewSession: jest.fn().mockImplementation(() => mockSession),
  getCurrentPrice: (...args: unknown[]) => mockGetCurrentPrice(...args),
  FinnhubQuoteProvider: jest.fn().mockImplementation(() => ({
    getCurrentPrice: (...args: unknown[]) => mockFinnhubGetCurrentPrice(...args),
  })),
}));

/** テスト用アラートファクトリ */
function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    AlertID: 'alert-1',
    UserID: 'user-1',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Mode: 'Sell',
    Frequency: 'MINUTE_LEVEL',
    Enabled: true,
    ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    },
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
    ...overrides,
  };
}

/** tradingview 用デフォルト取引所（PriceSource=tradingview） */
const mockExchange: Exchange = {
  ExchangeID: 'NASDAQ',
  Name: 'NASDAQ',
  Key: 'NSDQ',
  Timezone: 'America/New_York',
  Start: '04:00',
  End: '20:00',
  PriceSource: 'tradingview',
  CreatedAt: Date.now(),
  UpdatedAt: Date.now(),
};

describe('minute batch handler', () => {
  let mockDocClient: unknown;
  let mockAlertRepo: jest.Mocked<DynamoDBAlertRepository>;
  let mockExchangeRepo: jest.Mocked<ExchangeRepository>;
  let mockEvent: ScheduledEvent;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();
    mockGetCurrentPrice.mockReset();
    mockFinnhubGetCurrentPrice = jest.fn();

    // process.exit をモックして、container kill 発火時にテストプロセスが終了するのを防ぐ
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as () => never);

    // TradingViewSession モックを再生成
    mockSession = {
      getCurrentPrice: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      getSessionId: jest.fn().mockReturnValue('test-session-id'),
    };

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
    exitSpy.mockRestore();
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
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
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
      mockSession.getCurrentPrice.mockResolvedValue(205.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (sendWebPushNotification as jest.Mock).mockResolvedValue(true);
      (webPushClient.createAlertNotificationPayload as jest.Mock).mockReturnValue({
        title: 'Test Alert',
        body: 'Test body',
      });
      (getVapidConfig as jest.Mock).mockReturnValue({
        publicKey: 'test-public-key',
        privateKey: 'test-private-key',
        subject: 'mailto:support@nagiyu.com',
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(mockAlertRepo.getByFrequency).toHaveBeenCalledWith('MINUTE_LEVEL');
      expect(mockExchangeRepo.getById).toHaveBeenCalledWith('NASDAQ');
      expect(tradingHoursChecker.isTradingHours).toHaveBeenCalledWith(
        mockExchange,
        expect.any(Number)
      );
      expect(mockSession.getCurrentPrice).toHaveBeenCalledWith('NSDQ:AAPL', {
        timeout: 4000,
      });
      expect(alertEvaluator.evaluateAlert).toHaveBeenCalledWith(mockAlert, 205.0);
      expect(sendWebPushNotification).toHaveBeenCalledWith(
        mockAlert.subscription,
        {
          title: 'Test Alert',
          body: 'Test body',
        },
        {
          publicKey: 'test-public-key',
          privateKey: 'test-private-key',
          subject: 'mailto:support@nagiyu.com',
        }
      );

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
        Frequency: 'MINUTE_LEVEL',
        Enabled: false, // 無効化
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(mockExchangeRepo.getById).not.toHaveBeenCalled();
      expect(mockSession.getCurrentPrice).not.toHaveBeenCalled();
      expect(sendWebPushNotification).not.toHaveBeenCalled();

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
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
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
      expect(mockSession.getCurrentPrice).not.toHaveBeenCalled();
      expect(sendWebPushNotification).not.toHaveBeenCalled();

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
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
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
      mockSession.getCurrentPrice.mockResolvedValue(195.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(false); // 条件未達成

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(sendWebPushNotification).not.toHaveBeenCalled();

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
      expect(mockSession.getCurrentPrice).not.toHaveBeenCalled();
      expect(sendWebPushNotification).not.toHaveBeenCalled();

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
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
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
      // 共有セッション・新規 WS リトライともに失敗
      mockSession.getCurrentPrice.mockRejectedValue(new Error('TradingView API タイムアウト'));
      mockGetCurrentPrice.mockRejectedValue(new Error('TradingView API タイムアウト（新規 WS）'));
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200); // バッチ全体は成功
      expect(sendWebPushNotification).not.toHaveBeenCalled();
      expect(awsClients.reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'stock-tracker',
          severity: 'warning',
        })
      );

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
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(null); // Exchange が存在しない

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(mockSession.getCurrentPrice).not.toHaveBeenCalled();
      expect(sendWebPushNotification).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.errors).toBe(1);
    });
  });

  describe('異常系: DynamoDB 接続エラー', () => {
    it('DynamoDB 接続エラーが発生した場合、500 エラーを返す', async () => {
      // Arrange
      mockAlertRepo.getByFrequency.mockRejectedValue(new Error('DynamoDB 接続エラー'));
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(500);
      expect(awsClients.reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'stock-tracker',
          severity: 'error',
        })
      );
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
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test1',
          keys: {
            p256dh: 'test-p256dh-1',
            auth: 'test-auth-1',
          },
        },
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      const mockAlert2: Alert = {
        AlertID: 'alert-2',
        UserID: 'user-2',
        TickerID: 'NYSE:TSLA',
        ExchangeID: 'NYSE',
        Mode: 'Buy',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 150.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test2',
          keys: {
            p256dh: 'test-p256dh-2',
            auth: 'test-auth-2',
          },
        },
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

      // alert-1 (NSDQ:AAPL): 共有セッション失敗 → 新規 WS リトライも失敗
      // alert-2 (NYSE:TSLA): 正常処理
      mockSession.getCurrentPrice.mockImplementation(async (tickerId: string) => {
        if (tickerId === 'NSDQ:AAPL') throw new Error('API Error');
        return 145.0;
      });
      // standalone getCurrentPrice も NSDQ:AAPL で失敗させる
      mockGetCurrentPrice.mockRejectedValue(new Error('API Error（新規 WS）'));

      // alert-2: 正常処理
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (sendWebPushNotification as jest.Mock).mockResolvedValue(true);
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
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 110.0 },
        ],
        LogicalOperator: 'AND',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
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
      mockSession.getCurrentPrice.mockResolvedValue(105.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (sendWebPushNotification as jest.Mock).mockResolvedValue(true);
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
      expect(sendWebPushNotification).toHaveBeenCalledWith(
        mockAlert.subscription,
        {
          title: '売りアラート: NSDQ:AAPL',
          body: '現在価格 $105.00 が範囲 $100.00〜$110.00 内になりました',
        },
        expect.any(Object)
      );

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
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'gte', value: 100.0 },
          { field: 'price', operator: 'lte', value: 110.0 },
        ],
        // LogicalOperator は未指定（デフォルトで AND になる）
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
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
      mockSession.getCurrentPrice.mockResolvedValue(105.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (sendWebPushNotification as jest.Mock).mockResolvedValue(true);
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
      expect(sendWebPushNotification).toHaveBeenCalledWith(
        mockAlert.subscription,
        {
          title: '売りアラート: NSDQ:AAPL',
          body: '現在価格 $105.00 が範囲 $100.00〜$110.00 内になりました',
        },
        expect.any(Object)
      );

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
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [
          { field: 'price', operator: 'lte', value: 90.0 },
          { field: 'price', operator: 'gte', value: 120.0 },
        ],
        LogicalOperator: 'OR',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
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
      mockSession.getCurrentPrice.mockResolvedValue(85.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (sendWebPushNotification as jest.Mock).mockResolvedValue(true);
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
      expect(sendWebPushNotification).toHaveBeenCalledWith(
        mockAlert.subscription,
        {
          title: '売りアラート: NSDQ:AAPL',
          body: '現在価格 $85.00 が範囲外（$90.00 以下 または $120.00 以上）になりました',
        },
        expect.any(Object)
      );

      const body = JSON.parse(response.body);
      expect(body.statistics.conditionsMet).toBe(1);
      expect(body.statistics.notificationsSent).toBe(1);
    });
  });

  describe('正常系: 時間予算ガード', () => {
    beforeEach(() => {
      // -1 にすることで isBudgetExceeded が常に true を返す（Date.now() - startTime >= 0 > -1）
      process.env.MINUTE_BATCH_TIME_BUDGET_MS = '-1';
      process.env.MINUTE_BATCH_CONCURRENCY = '10';
    });

    afterEach(() => {
      delete process.env.MINUTE_BATCH_TIME_BUDGET_MS;
      delete process.env.MINUTE_BATCH_CONCURRENCY;
    });

    it('時間予算超過後のアラートは skippedTimeBudget としてカウントされる', async () => {
      const alerts = Array.from({ length: 5 }, (_, i) => makeAlert({ AlertID: `alert-${i}` }));

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: alerts });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      mockSession.getCurrentPrice.mockResolvedValue(205.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(false);

      const response = await handler(mockEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(5);
      expect(body.statistics.skippedTimeBudget).toBeGreaterThan(0);
      // processedAlerts + skippedTimeBudget = totalAlerts
      expect(body.statistics.processedAlerts + body.statistics.skippedTimeBudget).toBe(5);
    });

    it('時間予算超過があっても statusCode 200 で正常終了する', async () => {
      mockAlertRepo.getByFrequency.mockResolvedValue({
        items: [makeAlert(), makeAlert({ AlertID: 'alert-2' })],
      });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);

      const response = await handler(mockEvent);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('正常系: 並列実行', () => {
    beforeEach(() => {
      process.env.MINUTE_BATCH_CONCURRENCY = '3';
    });

    afterEach(() => {
      delete process.env.MINUTE_BATCH_CONCURRENCY;
    });

    it('複数アラートを並列処理し全件の統計が集計される', async () => {
      const alerts = Array.from({ length: 6 }, (_, i) =>
        makeAlert({ AlertID: `alert-${i}`, Enabled: false })
      );

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: alerts });

      const response = await handler(mockEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(6);
      expect(body.statistics.processedAlerts).toBe(6);
      expect(body.statistics.skippedDisabled).toBe(6);
      expect(body.statistics.skippedTimeBudget).toBe(0);
    });
  });

  describe('container kill 戦略', () => {
    beforeEach(() => {
      process.env.MINUTE_BATCH_CONTAINER_KILL_THRESHOLD = '1';
    });

    afterEach(() => {
      delete process.env.MINUTE_BATCH_CONTAINER_KILL_THRESHOLD;
    });

    it('errors が閾値以上の場合、session.close() 後に process.exit(1) を呼ぶ', async () => {
      // Arrange: 閾値 1 に対して errors = 1 になるケース（共有セッション + 新規 WS ともにタイムアウト）
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      mockSession.getCurrentPrice.mockRejectedValue(new Error('TradingView API タイムアウト'));
      mockGetCurrentPrice.mockRejectedValue(new Error('TradingView API タイムアウト（新規 WS）'));
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act
      await handler(mockEvent);

      // Assert: session.close() が先に呼ばれ、その後 process.exit(1) が呼ばれる
      expect(mockSession.close).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
      const closeOrder = mockSession.close.mock.invocationCallOrder[0];
      const exitOrder = exitSpy.mock.invocationCallOrder[0];
      expect(closeOrder).toBeLessThan(exitOrder);
    });

    it('errors が閾値未満の場合、process.exit を呼ばない', async () => {
      // Arrange: 閾値 1 に対して errors = 0 になるケース（Enabled=false はエラー扱いしない）
      const alert = makeAlert({ Enabled: false });
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });

      // Act
      await handler(mockEvent);

      // Assert
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('閾値環境変数が未設定の場合、デフォルト 1 で発火する', async () => {
      // Arrange: 環境変数を未設定（デフォルト値 1 で動作することを検証）
      delete process.env.MINUTE_BATCH_CONTAINER_KILL_THRESHOLD;
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      mockSession.getCurrentPrice.mockRejectedValue(new Error('TradingView API タイムアウト'));
      mockGetCurrentPrice.mockRejectedValue(new Error('TradingView API タイムアウト（新規 WS）'));
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act
      await handler(mockEvent);

      // Assert: errors=1 でデフォルト閾値 1 に到達 → process.exit(1) 発火
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('新規 WS リトライ（フォールバック）', () => {
    it('1 回目失敗・新規 WS 成功: 通知処理が走り errors=0・freshSessionRetries=1', async () => {
      // Arrange
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      // 共有セッション失敗 → 新規 WS 成功
      mockSession.getCurrentPrice.mockRejectedValue(new Error('共有セッション タイムアウト'));
      mockGetCurrentPrice.mockResolvedValue(205.0);

      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (sendWebPushNotification as jest.Mock).mockResolvedValue(true);
      (webPushClient.createAlertNotificationPayload as jest.Mock).mockReturnValue({
        title: 'テストアラート',
        body: 'テスト本文',
      });
      (getVapidConfig as jest.Mock).mockReturnValue({
        publicKey: 'test-public-key',
        privateKey: 'test-private-key',
        subject: 'mailto:support@nagiyu.com',
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      // 新規 WS で回収できたので通知が送信される
      expect(sendWebPushNotification).toHaveBeenCalled();

      const body = JSON.parse(response.body);
      // フォールバック成功 → errors は増えない
      expect(body.statistics.errors).toBe(0);
      // リトライカウントが記録される
      expect(body.statistics.freshSessionRetries).toBe(1);
      // 通知送信まで到達している
      expect(body.statistics.notificationsSent).toBe(1);
    });

    it('1 回目・2 回目ともに失敗: errors が増え reportErrorEvent が呼ばれる', async () => {
      // Arrange
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      // 共有セッション失敗 → 新規 WS も失敗
      mockSession.getCurrentPrice.mockRejectedValue(new Error('共有セッション タイムアウト'));
      mockGetCurrentPrice.mockRejectedValue(new Error('新規 WS タイムアウト'));
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200); // バッチ全体は成功
      expect(sendWebPushNotification).not.toHaveBeenCalled();
      expect(awsClients.reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'stock-tracker',
          severity: 'warning',
        })
      );

      const body = JSON.parse(response.body);
      expect(body.statistics.errors).toBe(1);
      expect(body.statistics.freshSessionRetries).toBe(1);
    });

    it('1 回目が成功: standalone getCurrentPrice が呼ばれず freshSessionRetries=0', async () => {
      // Arrange
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      // 共有セッション成功
      mockSession.getCurrentPrice.mockResolvedValue(205.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(false);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      // standalone getCurrentPrice は一切呼ばれない
      expect(mockGetCurrentPrice).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.freshSessionRetries).toBe(0);
      expect(body.statistics.errors).toBe(0);
    });
  });

  describe('Finnhub 経路（PriceSource = finnhub）', () => {
    const finnhubExchange: Exchange = {
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '04:00',
      End: '20:00',
      PriceSource: 'finnhub',
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    };

    it('PriceSource=finnhub の場合、FinnhubQuoteProvider が呼ばれ共有セッションは使わない', async () => {
      // Arrange
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(finnhubExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      mockFinnhubGetCurrentPrice.mockResolvedValue(205.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(false);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      // Finnhub provider が呼ばれ、共有セッションは使わない
      expect(mockFinnhubGetCurrentPrice).toHaveBeenCalledWith('NSDQ:AAPL', {
        timeout: 4000,
      });
      expect(mockSession.getCurrentPrice).not.toHaveBeenCalled();
      expect(mockGetCurrentPrice).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.errors).toBe(0);
      // Finnhub 経路には fresh-WS リトライがないため freshSessionRetries=0
      expect(body.statistics.freshSessionRetries).toBe(0);
    });

    it('PriceSource=finnhub で Finnhub API が成功: 通知が送信される', async () => {
      // Arrange
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(finnhubExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      mockFinnhubGetCurrentPrice.mockResolvedValue(205.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (sendWebPushNotification as jest.Mock).mockResolvedValue(true);
      (webPushClient.createAlertNotificationPayload as jest.Mock).mockReturnValue({
        title: 'Test Alert',
        body: 'Test body',
      });
      (getVapidConfig as jest.Mock).mockReturnValue({
        publicKey: 'test-public-key',
        privateKey: 'test-private-key',
        subject: 'mailto:support@nagiyu.com',
      });

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(sendWebPushNotification).toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.notificationsSent).toBe(1);
      expect(body.statistics.errors).toBe(0);
    });

    it('PriceSource=finnhub で Finnhub API が失敗: errors が増え container kill 閾値に到達する', async () => {
      // Arrange: MINUTE_BATCH_CONTAINER_KILL_THRESHOLD=1 でエラーが発生すると process.exit(1)
      process.env.MINUTE_BATCH_CONTAINER_KILL_THRESHOLD = '1';
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(finnhubExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      // Finnhub エラー（fresh-WS リトライなしで直接 catch に流れる）
      mockFinnhubGetCurrentPrice.mockRejectedValue(new Error('Finnhub API タイムアウト'));
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act
      await handler(mockEvent);

      // Assert: Finnhub エラーも stats.errors に計上され、閾値に到達 → container kill
      expect(exitSpy).toHaveBeenCalledWith(1);
      // fresh-WS リトライは発生しない（Finnhub 経路は単発）
      expect(mockGetCurrentPrice).not.toHaveBeenCalled();

      delete process.env.MINUTE_BATCH_CONTAINER_KILL_THRESHOLD;
    });

    it('PriceSource=finnhub で Finnhub API が失敗: standalone getCurrentPrice は呼ばれない', async () => {
      // Arrange
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(finnhubExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      mockFinnhubGetCurrentPrice.mockRejectedValue(new Error('Finnhub API エラー'));
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      // Finnhub 経路では fresh-WS リトライ（standalone getCurrentPrice）は呼ばれない
      expect(mockGetCurrentPrice).not.toHaveBeenCalled();
      expect(mockSession.getCurrentPrice).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.errors).toBe(1);
      expect(body.statistics.freshSessionRetries).toBe(0);
    });

    it('PriceSource=tradingview のアラートは引き続き共有セッション経路を使う', async () => {
      // Arrange: PriceSource=tradingview の取引所
      const alert = makeAlert();
      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [alert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange); // PriceSource='tradingview'
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      mockSession.getCurrentPrice.mockResolvedValue(205.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(false);

      // Act
      const response = await handler(mockEvent);

      // Assert: TradingView 共有セッション経路を使い、Finnhub は呼ばれない
      expect(mockSession.getCurrentPrice).toHaveBeenCalledWith('NSDQ:AAPL', {
        timeout: 4000,
      });
      expect(mockFinnhubGetCurrentPrice).not.toHaveBeenCalled();

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.errors).toBe(0);
    });
  });
});
