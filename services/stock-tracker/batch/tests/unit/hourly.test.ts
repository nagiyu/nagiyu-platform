/**
 * Unit tests for hourly batch processing
 *
 * PriceSource ベースのルーティングを検証する（Unit 2b 対応）
 */

import { handler } from '../../src/hourly.js';
import type { ScheduledEvent } from '../../src/hourly.js';
import * as awsClients from '@nagiyu/aws';
import * as webPushClient from '../../src/lib/web-push-client.js';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import type { ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { DynamoDBAlertRepository, DynamoDBExchangeRepository } from '@nagiyu/stock-tracker-core';
import * as alertEvaluator from '@nagiyu/stock-tracker-core';
import * as tradingHoursChecker from '@nagiyu/stock-tracker-core';
import type { Alert, Exchange } from '@nagiyu/stock-tracker-core';

// TradingViewQuoteProvider / FinnhubQuoteProvider のモックインスタンス
let mockTradingViewGetCurrentPrice: jest.Mock;
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
  TradingViewQuoteProvider: jest.fn().mockImplementation(() => ({
    getCurrentPrice: (...args: unknown[]) => mockTradingViewGetCurrentPrice(...args),
  })),
  FinnhubQuoteProvider: jest.fn().mockImplementation(() => ({
    getCurrentPrice: (...args: unknown[]) => mockFinnhubGetCurrentPrice(...args),
  })),
}));

describe('hourly batch handler', () => {
  let mockDocClient: unknown;
  let mockAlertRepo: jest.Mocked<DynamoDBAlertRepository>;
  let mockExchangeRepo: jest.Mocked<ExchangeRepository>;
  let mockEvent: ScheduledEvent;

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();

    // provider モックを再生成
    mockTradingViewGetCurrentPrice = jest.fn();
    mockFinnhubGetCurrentPrice = jest.fn();

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

  describe('正常系: PriceSource=tradingview（デフォルト）で TradingView provider を使用', () => {
    it('PriceSource=tradingview の取引所では TradingViewQuoteProvider で価格取得する', async () => {
      // Arrange
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'TSE:6501',
        ExchangeID: 'TSE',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 3000.0 }],
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
        ExchangeID: 'TSE',
        Name: '東京証券取引所',
        Key: 'TSE',
        Timezone: 'Asia/Tokyo',
        Start: '09:00',
        End: '15:30',
        PriceSource: 'tradingview',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      mockTradingViewGetCurrentPrice.mockResolvedValue(3200.0);
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
      // TradingView provider が呼ばれ、Finnhub は呼ばれない
      expect(mockTradingViewGetCurrentPrice).toHaveBeenCalledWith('TSE:6501');
      expect(mockFinnhubGetCurrentPrice).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.notificationsSent).toBe(1);
    });
  });

  describe('正常系: PriceSource=finnhub で Finnhub provider を使用', () => {
    it('PriceSource=finnhub の取引所では FinnhubQuoteProvider で価格取得する', async () => {
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
        PriceSource: 'finnhub',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
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
      // Finnhub provider が呼ばれ、TradingView は呼ばれない
      expect(mockFinnhubGetCurrentPrice).toHaveBeenCalledWith('NSDQ:AAPL');
      expect(mockTradingViewGetCurrentPrice).not.toHaveBeenCalled();
      expect(mockAlertRepo.getByFrequency).toHaveBeenCalledWith('HOURLY_LEVEL');
      expect(mockExchangeRepo.getById).toHaveBeenCalledWith('NASDAQ');

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(1);
      expect(body.statistics.notificationsSent).toBe(1);
    });
  });

  describe('正常系: PriceSource 未設定時は tradingview にフォールバック', () => {
    it('PriceSource が undefined の場合は TradingView provider を使用する（安全側デフォルト）', async () => {
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
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
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
        // PriceSource を意図的に未設定（undefined）
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      mockTradingViewGetCurrentPrice.mockResolvedValue(205.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(false);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      // PriceSource 未設定 → tradingview にフォールバック
      expect(mockTradingViewGetCurrentPrice).toHaveBeenCalledWith('NSDQ:AAPL');
      expect(mockFinnhubGetCurrentPrice).not.toHaveBeenCalled();
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
        Enabled: false,
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
      expect(mockTradingViewGetCurrentPrice).not.toHaveBeenCalled();
      expect(mockFinnhubGetCurrentPrice).not.toHaveBeenCalled();
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
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
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
        PriceSource: 'tradingview',
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
      expect(mockTradingViewGetCurrentPrice).not.toHaveBeenCalled();
      expect(mockFinnhubGetCurrentPrice).not.toHaveBeenCalled();
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
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
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
        PriceSource: 'tradingview',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      mockTradingViewGetCurrentPrice.mockResolvedValue(195.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(false);

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
      expect(mockTradingViewGetCurrentPrice).not.toHaveBeenCalled();
      expect(mockFinnhubGetCurrentPrice).not.toHaveBeenCalled();
      expect(sendWebPushNotification).not.toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(0);
      expect(body.statistics.processedAlerts).toBe(0);
    });
  });

  describe('異常系: Finnhub API エラー', () => {
    it('PriceSource=finnhub の取引所で Finnhub API がエラーを返した場合、エラーをログに記録して継続', async () => {
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
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
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
        PriceSource: 'finnhub',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      mockFinnhubGetCurrentPrice.mockRejectedValue(new Error('Finnhub API タイムアウト'));
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
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
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(null);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(mockTradingViewGetCurrentPrice).not.toHaveBeenCalled();
      expect(mockFinnhubGetCurrentPrice).not.toHaveBeenCalled();
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

  describe('正常系: PriceSource 混在（finnhub と tradingview が同一 invocation 内）', () => {
    it('finnhub アラートと tradingview アラートが混在しても正しく振り分けられる', async () => {
      // Arrange
      const alertFinnhub: Alert = {
        AlertID: 'alert-finnhub',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-finnhub',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      const alertTradingView: Alert = {
        AlertID: 'alert-tv',
        UserID: 'user-2',
        TickerID: 'TSE:6501',
        ExchangeID: 'TSE',
        Mode: 'Buy',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'lte', value: 3000.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-tv',
          keys: { p256dh: 'test-p256dh-2', auth: 'test-auth-2' },
        },
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      const exchangeNasdaq: Exchange = {
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

      const exchangeTse: Exchange = {
        ExchangeID: 'TSE',
        Name: '東京証券取引所',
        Key: 'TSE',
        Timezone: 'Asia/Tokyo',
        Start: '09:00',
        End: '15:30',
        PriceSource: 'tradingview',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({
        items: [alertFinnhub, alertTradingView],
      });
      mockExchangeRepo.getById.mockImplementation(async (id: string) => {
        if (id === 'NASDAQ') return exchangeNasdaq;
        if (id === 'TSE') return exchangeTse;
        return null;
      });
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

      // 各 provider が呼ばれたか確認
      mockFinnhubGetCurrentPrice.mockResolvedValue(205.0);
      mockTradingViewGetCurrentPrice.mockResolvedValue(2950.0);

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
      // Finnhub が NASDAQ:AAPL で呼ばれ、TradingView が TSE:6501 で呼ばれる
      expect(mockFinnhubGetCurrentPrice).toHaveBeenCalledWith('NSDQ:AAPL');
      expect(mockTradingViewGetCurrentPrice).toHaveBeenCalledWith('TSE:6501');

      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(2);
      expect(body.statistics.notificationsSent).toBe(2);
      expect(body.statistics.errors).toBe(0);
    });
  });

  describe('異常系: 通知送信失敗', () => {
    it('sendWebPushNotification が false を返した場合、errors カウンターが増加する', async () => {
      const mockAlert: Alert = {
        AlertID: 'alert-1',
        UserID: 'user-1',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'HOURLY_LEVEL',
        Enabled: true,
        ConditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
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
        PriceSource: 'tradingview',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue({ items: [mockAlert] });
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      mockTradingViewGetCurrentPrice.mockResolvedValue(205.0);
      (alertEvaluator.evaluateAlert as jest.Mock).mockReturnValue(true);
      (sendWebPushNotification as jest.Mock).mockResolvedValue(false);
      (webPushClient.createAlertNotificationPayload as jest.Mock).mockReturnValue({
        title: 'Test Alert',
        body: 'Test body',
      });
      (getVapidConfig as jest.Mock).mockReturnValue({
        publicKey: 'test-public-key',
        privateKey: 'test-private-key',
        subject: 'mailto:support@nagiyu.com',
      });

      const response = await handler(mockEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.conditionsMet).toBe(1);
      expect(body.statistics.notificationsSent).toBe(0);
      expect(body.statistics.errors).toBe(1);
    });
  });
});
