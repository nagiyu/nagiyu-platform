import { handler } from '../../src/temporary-alert-expiry.js';
import type { ScheduledEvent } from '../../src/temporary-alert-expiry.js';
import * as awsClients from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import type { ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { DynamoDBAlertRepository, DynamoDBExchangeRepository } from '@nagiyu/stock-tracker-core';
import * as tradingHoursChecker from '@nagiyu/stock-tracker-core';
import type { Alert, Exchange } from '@nagiyu/stock-tracker-core';

jest.mock('@nagiyu/common', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@nagiyu/aws');
jest.mock('@nagiyu/stock-tracker-core', () => ({
  ...jest.requireActual('@nagiyu/stock-tracker-core'),
  DynamoDBAlertRepository: jest.fn(),
  DynamoDBExchangeRepository: jest.fn(),
  isTradingHours: jest.fn(),
  getLastTradingDate: jest.fn(),
}));

describe('temporary alert expiry batch handler', () => {
  let mockAlertRepo: jest.Mocked<DynamoDBAlertRepository>;
  let mockExchangeRepo: jest.Mocked<ExchangeRepository>;
  let mockEvent: ScheduledEvent;

  beforeEach(() => {
    jest.clearAllMocks();

    (awsClients.getDynamoDBDocumentClient as jest.Mock).mockReturnValue({});
    (awsClients.getTableName as jest.Mock).mockReturnValue('test-table');

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

    mockEvent = {
      version: '0',
      id: 'event-id',
      'detail-type': 'Scheduled Event',
      source: 'aws.events',
      account: '123456789012',
      time: '2026-03-05T00:00:00Z',
      region: 'ap-northeast-1',
      resources: [],
      detail: {},
    };
  });

  it('期限切れ一時通知を削除する', async () => {
    const alert: Alert = {
      AlertID: 'a1',
      UserID: 'u1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'HOURLY_LEVEL',
      Enabled: true,
      Temporary: true,
      TemporaryExpireDate: '2026-03-04',
      ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
      subscription: {
        endpoint: 'endpoint',
        keys: {
          p256dh: 'p256',
          auth: 'auth',
        },
      },
      CreatedAt: 1,
      UpdatedAt: 1,
    };
    const exchange: Exchange = {
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '04:00',
      End: '20:00',
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    mockAlertRepo.getByFrequency
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [alert] });
    mockExchangeRepo.getById.mockResolvedValue(exchange);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);
    (tradingHoursChecker.getLastTradingDate as jest.Mock).mockReturnValue('2026-03-04');

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.delete).toHaveBeenCalledWith('u1', 'a1');
    expect(body.statistics.deactivated).toBe(1);
  });

  it('一時通知でないアラートはスキップする', async () => {
    const alert: Alert = {
      AlertID: 'a1',
      UserID: 'u1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
      subscription: {
        endpoint: 'endpoint',
        keys: {
          p256dh: 'p256',
          auth: 'auth',
        },
      },
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    mockAlertRepo.getByFrequency
      .mockResolvedValueOnce({ items: [alert] })
      .mockResolvedValueOnce({ items: [] });

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.delete).not.toHaveBeenCalled();
    expect(body.statistics.skippedNonTemporary).toBe(1);
  });

  it('ページネーションで全件取得して処理する', async () => {
    const minuteAlertPage1: Alert = {
      AlertID: 'm1',
      UserID: 'u1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      Temporary: true,
      TemporaryExpireDate: '2026-03-04',
      ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
      subscription: {
        endpoint: 'endpoint',
        keys: {
          p256dh: 'p256',
          auth: 'auth',
        },
      },
      CreatedAt: 1,
      UpdatedAt: 1,
    };
    const minuteAlertPage2: Alert = { ...minuteAlertPage1, AlertID: 'm2' };
    const hourlyAlert: Alert = { ...minuteAlertPage1, AlertID: 'h1', Frequency: 'HOURLY_LEVEL' };
    const exchange: Exchange = {
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '04:00',
      End: '20:00',
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    mockAlertRepo.getByFrequency
      .mockResolvedValueOnce({ items: [minuteAlertPage1], nextCursor: 'cursor-1', count: 1 })
      .mockResolvedValueOnce({ items: [minuteAlertPage2], nextCursor: undefined, count: 1 })
      .mockResolvedValueOnce({ items: [hourlyAlert], nextCursor: undefined, count: 1 });
    mockExchangeRepo.getById.mockResolvedValue(exchange);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);
    (tradingHoursChecker.getLastTradingDate as jest.Mock).mockReturnValue('2026-03-04');

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.getByFrequency).toHaveBeenNthCalledWith(1, 'MINUTE_LEVEL', {
      cursor: undefined,
    });
    expect(mockAlertRepo.getByFrequency).toHaveBeenNthCalledWith(2, 'MINUTE_LEVEL', {
      cursor: 'cursor-1',
    });
    expect(mockAlertRepo.getByFrequency).toHaveBeenNthCalledWith(3, 'HOURLY_LEVEL', {
      cursor: undefined,
    });
    expect(body.statistics.totalAlerts).toBe(3);
  });

  it('getByFrequencyでエラーが発生した場合は500を返す', async () => {
    mockAlertRepo.getByFrequency.mockRejectedValue(new Error('DynamoDB 接続エラー'));

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(500);
    expect(body.message).toBe('一時通知アラート失効バッチでエラーが発生しました');
    expect(body.error).toContain('DynamoDB 接続エラー');
  });

  it('TemporaryExpireDate がない場合は無効データとしてスキップする', async () => {
    const alert: Alert = {
      AlertID: 'a1',
      UserID: 'u1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      Temporary: true,
      ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
      subscription: {
        endpoint: 'endpoint',
        keys: {
          p256dh: 'p256',
          auth: 'auth',
        },
      },
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    mockAlertRepo.getByFrequency
      .mockResolvedValueOnce({ items: [alert], nextCursor: undefined, count: 1 })
      .mockResolvedValueOnce({ items: [], nextCursor: undefined, count: 0 });

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.delete).not.toHaveBeenCalled();
    expect(body.statistics.skippedInvalidData).toBe(1);
  });

  it('取引所情報が見つからない場合は errors を加算する', async () => {
    const alert: Alert = {
      AlertID: 'a1',
      UserID: 'u1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      Temporary: true,
      TemporaryExpireDate: '2026-03-04',
      ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
      subscription: {
        endpoint: 'endpoint',
        keys: {
          p256dh: 'p256',
          auth: 'auth',
        },
      },
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    mockAlertRepo.getByFrequency
      .mockResolvedValueOnce({ items: [alert], nextCursor: undefined, count: 1 })
      .mockResolvedValueOnce({ items: [], nextCursor: undefined, count: 0 });
    mockExchangeRepo.getById.mockResolvedValue(null);

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.delete).not.toHaveBeenCalled();
    expect(body.statistics.errors).toBe(1);
  });

  it('取引時間中はスキップする', async () => {
    const alert: Alert = {
      AlertID: 'a1',
      UserID: 'u1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      Temporary: true,
      TemporaryExpireDate: '2026-03-04',
      ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
      subscription: {
        endpoint: 'endpoint',
        keys: {
          p256dh: 'p256',
          auth: 'auth',
        },
      },
      CreatedAt: 1,
      UpdatedAt: 1,
    };
    const exchange: Exchange = {
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '04:00',
      End: '20:00',
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    mockAlertRepo.getByFrequency
      .mockResolvedValueOnce({ items: [alert], nextCursor: undefined, count: 1 })
      .mockResolvedValueOnce({ items: [], nextCursor: undefined, count: 0 });
    mockExchangeRepo.getById.mockResolvedValue(exchange);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.delete).not.toHaveBeenCalled();
    expect(body.statistics.skippedTradingHours).toBe(1);
  });

  it('まだ期限切れでない場合はスキップする', async () => {
    const alert: Alert = {
      AlertID: 'a1',
      UserID: 'u1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      Temporary: true,
      TemporaryExpireDate: '2026-03-05',
      ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
      subscription: {
        endpoint: 'endpoint',
        keys: {
          p256dh: 'p256',
          auth: 'auth',
        },
      },
      CreatedAt: 1,
      UpdatedAt: 1,
    };
    const exchange: Exchange = {
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '04:00',
      End: '20:00',
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    mockAlertRepo.getByFrequency
      .mockResolvedValueOnce({ items: [alert], nextCursor: undefined, count: 1 })
      .mockResolvedValueOnce({ items: [], nextCursor: undefined, count: 0 });
    mockExchangeRepo.getById.mockResolvedValue(exchange);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);
    (tradingHoursChecker.getLastTradingDate as jest.Mock).mockReturnValue('2026-03-04');

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.delete).not.toHaveBeenCalled();
    expect(body.statistics.skippedNotExpired).toBe(1);
  });

  it('delete 失敗時は errors を加算して処理を継続する', async () => {
    const alert1: Alert = {
      AlertID: 'a1',
      UserID: 'u1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      Temporary: true,
      TemporaryExpireDate: '2026-03-04',
      ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
      subscription: {
        endpoint: 'endpoint',
        keys: {
          p256dh: 'p256',
          auth: 'auth',
        },
      },
      CreatedAt: 1,
      UpdatedAt: 1,
    };
    const alert2: Alert = { ...alert1, AlertID: 'a2' };
    const exchange: Exchange = {
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '04:00',
      End: '20:00',
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    mockAlertRepo.getByFrequency
      .mockResolvedValueOnce({ items: [alert1, alert2], nextCursor: undefined, count: 2 })
      .mockResolvedValueOnce({ items: [], nextCursor: undefined, count: 0 });
    mockExchangeRepo.getById.mockResolvedValue(exchange);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);
    (tradingHoursChecker.getLastTradingDate as jest.Mock).mockReturnValue('2026-03-04');
    mockAlertRepo.delete
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockResolvedValueOnce(alert2);

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.statistics.errors).toBe(1);
    expect(body.statistics.deactivated).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      '一時通知アラートの失効処理でエラーが発生しました',
      expect.objectContaining({
        alertId: 'a1',
        userId: 'u1',
      })
    );
  });

  it('ページ上限到達時にワーニングログを出力し、HOURLY_LEVEL の処理を継続する', async () => {
    const minuteAlert: Alert = {
      AlertID: 'm1',
      UserID: 'u1',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Mode: 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: false,
      Temporary: true,
      TemporaryExpireDate: '2026-03-04',
      ConditionList: [{ field: 'price', operator: 'lte', value: 100 }],
      subscription: {
        endpoint: 'endpoint',
        keys: {
          p256dh: 'p256',
          auth: 'auth',
        },
      },
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    const hourlyAlert: Alert = {
      ...minuteAlert,
      AlertID: 'h1',
      Frequency: 'HOURLY_LEVEL',
    };

    for (let i = 0; i < 20; i++) {
      mockAlertRepo.getByFrequency.mockResolvedValueOnce({
        items: [{ ...minuteAlert, AlertID: `m-${i}` }],
        nextCursor: `cursor-${i}`,
        count: 1,
      });
    }
    mockAlertRepo.getByFrequency.mockResolvedValueOnce({
      items: [hourlyAlert],
      nextCursor: undefined,
      count: 1,
    });

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.statistics.totalAlerts).toBe(21);
    expect(mockAlertRepo.getByFrequency).toHaveBeenLastCalledWith('HOURLY_LEVEL', {
      cursor: undefined,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '一時通知アラート取得のページ上限に達したため途中終了します',
      expect.objectContaining({
        frequency: 'MINUTE_LEVEL',
        maxPages: 20,
      })
    );
  });
});
