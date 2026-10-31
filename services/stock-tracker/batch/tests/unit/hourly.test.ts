/**
 * Unit tests for hourly batch processing
 *
 * PriceSource ベースのルーティングを検証する（Unit 2b 対応）
 */

import { handler } from '../../src/hourly.js';
import type { ScheduledEvent } from '@nagiyu/aws';
import * as awsClients from '@nagiyu/aws';
import type { InMemoryErrorEventWriter } from '@nagiyu/aws';
import * as webPushClient from '../../src/lib/web-push-client.js';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import type { AlertRepository, ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { createAlertRepository, createExchangeRepository } from '@nagiyu/stock-tracker-core';
import * as alertEvaluator from '@nagiyu/stock-tracker-core';
import * as tradingHoursChecker from '@nagiyu/stock-tracker-core';
import type { AlertEntity, ExchangeEntity } from '@nagiyu/stock-tracker-core';

// TradingViewQuoteProvider / FinnhubQuoteProvider のモックインスタンス
let mockTradingViewGetCurrentPrice: jest.Mock;
let mockFinnhubGetCurrentPrice: jest.Mock;

// モックの設定
// createScheduledHandler の骨格は本物を使い、骨格内部のエラー報告も同じモックで観測できるよう
// 報告関数の実体モジュールを差し替える。
jest.mock('../../../../../libs/aws/src/error-events/report.js', () => ({
  ...jest.requireActual('../../../../../libs/aws/src/error-events/report.js'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));
jest.mock('@nagiyu/aws', () => {
  const actual = jest.requireActual('@nagiyu/aws');
  return {
    ...jest.createMockFromModule('@nagiyu/aws'),
    createScheduledHandler: actual.createScheduledHandler,
    reportErrorEvent: actual.reportErrorEvent,
    // レポーターは実物を通し、書き込み先の in-memory ライターで報告内容を確かめる
    createErrorReporter: actual.createErrorReporter,
    createErrorEventWriter: actual.createErrorEventWriter,
    resetErrorEventWriter: actual.resetErrorEventWriter,
  };
});
jest.mock('../../src/lib/web-push-client.js');
jest.mock('@nagiyu/common/push', () => ({
  sendWebPushNotification: jest.fn(),
  getVapidConfig: jest.fn(),
}));
jest.mock('@nagiyu/stock-tracker-core', () => ({
  ...jest.requireActual('@nagiyu/stock-tracker-core'),
  createAlertRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
  evaluateAlert: jest.fn(),
  isTradingHours: jest.fn(),
  TradingViewQuoteProvider: jest.fn().mockImplementation(() => ({
    getCurrentPrice: (...args: unknown[]) => mockTradingViewGetCurrentPrice(...args),
  })),
  FinnhubQuoteProvider: jest.fn().mockImplementation(() => ({
    getCurrentPrice: (...args: unknown[]) => mockFinnhubGetCurrentPrice(...args),
  })),
}));

/** レポーターが書き込んだ ErrorEvent を取り出す */
function getReportedEvents() {
  return (awsClients.createErrorEventWriter() as InMemoryErrorEventWriter).getRecords();
}

describe('hourly batch handler', () => {
  let mockDocClient: unknown;
  let mockAlertRepo: jest.Mocked<AlertRepository>;
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
    } as unknown as jest.Mocked<AlertRepository>;

    mockExchangeRepo = {
      getById: jest.fn(),
      getAll: jest.fn(),
      getAllIndexed: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    (createAlertRepository as jest.Mock).mockImplementation(() => mockAlertRepo);
    (createExchangeRepository as jest.Mock).mockImplementation(() => mockExchangeRepo);

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
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = 'test-error-events';
    awsClients.resetErrorEventWriter();
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  });

  afterEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    awsClients.resetErrorEventWriter();
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  describe('正常系: PriceSource=tradingview（デフォルト）で TradingView provider を使用', () => {
    it('PriceSource=tradingview の取引所では TradingViewQuoteProvider で価格取得する', async () => {
      // Arrange
      const mockAlert: AlertEntity = {
        alertId: 'alert-1',
        userId: 'user-1',
        tickerId: 'TSE:6501',
        exchangeId: 'TSE',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'gte', value: 3000.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockExchange: ExchangeEntity = {
        exchangeId: 'TSE',
        name: '東京証券取引所',
        key: 'TSE',
        timezone: 'Asia/Tokyo',
        start: '09:00',
        end: '15:30',
        priceSource: 'tradingview',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([mockAlert]);
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
      const mockAlert: AlertEntity = {
        alertId: 'alert-1',
        userId: 'user-1',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockExchange: ExchangeEntity = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'finnhub',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([mockAlert]);
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
      const mockAlert: AlertEntity = {
        alertId: 'alert-1',
        userId: 'user-1',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockExchange: ExchangeEntity = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview',
        // PriceSource を意図的に未設定（undefined）
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([mockAlert]);
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
      const mockAlert: AlertEntity = {
        alertId: 'alert-1',
        userId: 'user-1',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: false,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([mockAlert]);

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
      const mockAlert: AlertEntity = {
        alertId: 'alert-1',
        userId: 'user-1',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockExchange: ExchangeEntity = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([mockAlert]);
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
      const mockAlert: AlertEntity = {
        alertId: 'alert-1',
        userId: 'user-1',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockExchange: ExchangeEntity = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([mockAlert]);
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
      mockAlertRepo.getByFrequency.mockResolvedValue([]);

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
      const mockAlert: AlertEntity = {
        alertId: 'alert-1',
        userId: 'user-1',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockExchange: ExchangeEntity = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'finnhub',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([mockAlert]);
      mockExchangeRepo.getById.mockResolvedValue(mockExchange);
      (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);
      mockFinnhubGetCurrentPrice.mockRejectedValue(new Error('Finnhub API タイムアウト'));
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act
      const response = await handler(mockEvent);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(sendWebPushNotification).not.toHaveBeenCalled();
      expect(getReportedEvents()).toEqual([
        expect.objectContaining({
          serviceId: 'stock-tracker',
          severity: 'warning',
          title: '時間次バッチ: アラート処理エラー',
        }),
      ]);
      const [reported] = getReportedEvents();
      expect(JSON.parse(reported.context)).toEqual(
        expect.objectContaining({
          alertId: 'alert-1',
          userId: 'user-1',
          errorName: 'Error',
          errorMessage: expect.any(String),
          errorStack: expect.stringContaining('Error'),
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
      const mockAlert: AlertEntity = {
        alertId: 'alert-1',
        userId: 'user-1',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'INVALID',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([mockAlert]);
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
    it('DynamoDB 接続エラーが発生した場合、エラー報告したうえで例外を再送出する', async () => {
      // Arrange
      const dbError = new Error('DynamoDB 接続エラー');
      mockAlertRepo.getByFrequency.mockRejectedValue(dbError);
      (awsClients.reportErrorEvent as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(handler(mockEvent)).rejects.toBe(dbError);
      expect(awsClients.reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'stock-tracker',
          severity: 'error',
          title: '時間次バッチ: 致命的エラー',
          message: 'DynamoDB 接続エラー',
        })
      );
    });
  });

  describe('正常系: PriceSource 混在（finnhub と tradingview が同一 invocation 内）', () => {
    it('finnhub アラートと tradingview アラートが混在しても正しく振り分けられる', async () => {
      // Arrange
      const alertFinnhub: AlertEntity = {
        alertId: 'alert-finnhub',
        userId: 'user-1',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-finnhub',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const alertTradingView: AlertEntity = {
        alertId: 'alert-tv',
        userId: 'user-2',
        tickerId: 'TSE:6501',
        exchangeId: 'TSE',
        mode: 'Buy',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'lte', value: 3000.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-tv',
          keys: { p256dh: 'test-p256dh-2', auth: 'test-auth-2' },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const exchangeNasdaq: ExchangeEntity = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'finnhub',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const exchangeTse: ExchangeEntity = {
        exchangeId: 'TSE',
        name: '東京証券取引所',
        key: 'TSE',
        timezone: 'Asia/Tokyo',
        start: '09:00',
        end: '15:30',
        priceSource: 'tradingview',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([alertFinnhub, alertTradingView]);
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
    it('購読が無効（sendWebPushNotification が false）の場合、errors ではなく invalidSubscriptions が増加しアラートは変更されない', async () => {
      const mockAlert: AlertEntity = {
        alertId: 'alert-1',
        userId: 'user-1',
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: true,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockExchange: ExchangeEntity = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockAlertRepo.getByFrequency.mockResolvedValue([mockAlert]);
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
      expect(body.statistics.errors).toBe(0);
      expect(body.statistics.invalidSubscriptions).toBe(1);
      expect(awsClients.reportErrorEvent).not.toHaveBeenCalled();
      expect(mockAlertRepo.update).not.toHaveBeenCalled();
      expect(mockAlertRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('正常系: 51件以上のアラート（Issue #3801: getByFrequencyの既定50件打ち切り防止）', () => {
    it('51件のアラートがすべて処理対象になり、totalAlertsに全件数が入る', async () => {
      const total = 51;
      const alerts: AlertEntity[] = Array.from({ length: total }, (_, i) => ({
        alertId: `alert-${i}`,
        userId: `user-${i}`,
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        mode: 'Sell',
        frequency: 'HOURLY_LEVEL',
        enabled: false,
        conditionList: [{ field: 'price', operator: 'gte', value: 200.0 }],
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test',
          keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      mockAlertRepo.getByFrequency.mockResolvedValue(alerts);

      const response = await handler(mockEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.statistics.totalAlerts).toBe(total);
      expect(body.statistics.processedAlerts).toBe(total);
      expect(body.statistics.skippedDisabled).toBe(total);
    });
  });
});
