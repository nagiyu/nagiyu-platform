import { handler } from '../../src/temporary-alert-expiry.js';
import type { ScheduledEvent } from '../../src/temporary-alert-expiry.js';
import * as awsClients from '../../src/lib/aws-clients.js';
import type { ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { DynamoDBAlertRepository, DynamoDBExchangeRepository } from '@nagiyu/stock-tracker-core';
import * as tradingHoursChecker from '@nagiyu/stock-tracker-core';
import type { Alert, Exchange } from '@nagiyu/stock-tracker-core';

jest.mock('../../src/lib/aws-clients.js');
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

  it('期限切れ一時通知を無効化する', async () => {
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
      SubscriptionEndpoint: 'endpoint',
      SubscriptionKeysP256dh: 'p256',
      SubscriptionKeysAuth: 'auth',
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
    expect(mockAlertRepo.update).toHaveBeenCalledWith('u1', 'a1', { Enabled: false });
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
      SubscriptionEndpoint: 'endpoint',
      SubscriptionKeysP256dh: 'p256',
      SubscriptionKeysAuth: 'auth',
      CreatedAt: 1,
      UpdatedAt: 1,
    };

    mockAlertRepo.getByFrequency
      .mockResolvedValueOnce({ items: [alert] })
      .mockResolvedValueOnce({ items: [] });

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.update).not.toHaveBeenCalled();
    expect(body.statistics.skippedNonTemporary).toBe(1);
  });
});
