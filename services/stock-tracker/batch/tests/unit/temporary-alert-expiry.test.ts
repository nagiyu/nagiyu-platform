import { handler } from '../../src/temporary-alert-expiry.js';
import type { ScheduledEvent } from '../../src/temporary-alert-expiry.js';
import * as awsClients from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import type {
  ExchangeRepository,
  TemporaryAlertCandidate,
} from '@nagiyu/stock-tracker-core';
import { DynamoDBAlertRepository, DynamoDBExchangeRepository } from '@nagiyu/stock-tracker-core';
import * as tradingHoursChecker from '@nagiyu/stock-tracker-core';
import type { Exchange } from '@nagiyu/stock-tracker-core';

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

const NASDAQ: Exchange = {
  ExchangeID: 'NASDAQ',
  Name: 'NASDAQ',
  Key: 'NSDQ',
  Timezone: 'America/New_York',
  Start: '04:00',
  End: '20:00',
  CreatedAt: 1,
  UpdatedAt: 1,
};

function buildCandidate(overrides: Partial<TemporaryAlertCandidate> = {}): TemporaryAlertCandidate {
  return {
    AlertID: 'a1',
    UserID: 'u1',
    ExchangeID: 'NASDAQ',
    Frequency: 'MINUTE_LEVEL',
    Enabled: true,
    Temporary: true,
    TemporaryExpireDate: '2026-03-04',
    ...overrides,
  };
}

describe('temporary alert expiry batch handler', () => {
  let mockAlertRepo: jest.Mocked<DynamoDBAlertRepository>;
  let mockExchangeRepo: jest.Mocked<ExchangeRepository>;
  let mockEvent: ScheduledEvent;

  beforeEach(() => {
    jest.clearAllMocks();

    (awsClients.getDynamoDBDocumentClient as jest.Mock).mockReturnValue({});
    (awsClients.getTableName as jest.Mock).mockReturnValue('test-table');

    mockAlertRepo = {
      getById: jest.fn(),
      getByUserId: jest.fn(),
      getByFrequency: jest.fn(),
      getTemporaryCandidatesByFrequency: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      markTemporaryAsExpired: jest.fn(),
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

  it('期限切れ一時通知は markTemporaryAsExpired で無効化＋TTL 設定される', async () => {
    const candidate = buildCandidate({ Frequency: 'HOURLY_LEVEL' });

    mockAlertRepo.getTemporaryCandidatesByFrequency
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [candidate] });
    mockExchangeRepo.getById.mockResolvedValue(NASDAQ);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);
    (tradingHoursChecker.getLastTradingDate as jest.Mock).mockReturnValue('2026-03-04');

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.delete).not.toHaveBeenCalled();
    expect(mockAlertRepo.markTemporaryAsExpired).toHaveBeenCalledTimes(1);

    const [userId, alertId, ttlSeconds] = mockAlertRepo.markTemporaryAsExpired.mock.calls[0];
    expect(userId).toBe('u1');
    expect(alertId).toBe('a1');
    // 7 日後の Unix 秒（多少のテスト実行ラグを許容）
    const nowSeconds = Math.floor(Date.now() / 1000);
    const sevenDaysSeconds = 7 * 24 * 60 * 60;
    expect(ttlSeconds).toBeGreaterThanOrEqual(nowSeconds + sevenDaysSeconds - 5);
    expect(ttlSeconds).toBeLessThanOrEqual(nowSeconds + sevenDaysSeconds + 5);

    expect(body.statistics.deactivated).toBe(1);
  });

  it('TemporaryExpireDate がない候補は無効データとしてスキップする', async () => {
    const candidate = buildCandidate({ TemporaryExpireDate: '' });

    mockAlertRepo.getTemporaryCandidatesByFrequency
      .mockResolvedValueOnce({ items: [candidate] })
      .mockResolvedValueOnce({ items: [] });

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.markTemporaryAsExpired).not.toHaveBeenCalled();
    expect(body.statistics.skippedInvalidData).toBe(1);
  });

  it('取引所情報が見つからない場合は errors を加算する', async () => {
    mockAlertRepo.getTemporaryCandidatesByFrequency
      .mockResolvedValueOnce({ items: [buildCandidate()] })
      .mockResolvedValueOnce({ items: [] });
    mockExchangeRepo.getById.mockResolvedValue(null);

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.markTemporaryAsExpired).not.toHaveBeenCalled();
    expect(body.statistics.errors).toBe(1);
  });

  it('取引時間中はスキップする', async () => {
    mockAlertRepo.getTemporaryCandidatesByFrequency
      .mockResolvedValueOnce({ items: [buildCandidate()] })
      .mockResolvedValueOnce({ items: [] });
    mockExchangeRepo.getById.mockResolvedValue(NASDAQ);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(true);

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.markTemporaryAsExpired).not.toHaveBeenCalled();
    expect(body.statistics.skippedTradingHours).toBe(1);
  });

  it('まだ期限切れでない場合はスキップする', async () => {
    mockAlertRepo.getTemporaryCandidatesByFrequency
      .mockResolvedValueOnce({ items: [buildCandidate({ TemporaryExpireDate: '2026-03-05' })] })
      .mockResolvedValueOnce({ items: [] });
    mockExchangeRepo.getById.mockResolvedValue(NASDAQ);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);
    (tradingHoursChecker.getLastTradingDate as jest.Mock).mockReturnValue('2026-03-04');

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(mockAlertRepo.markTemporaryAsExpired).not.toHaveBeenCalled();
    expect(body.statistics.skippedNotExpired).toBe(1);
  });

  it('markTemporaryAsExpired が失敗しても errors を加算して処理を継続する', async () => {
    const a1 = buildCandidate({ AlertID: 'a1' });
    const a2 = buildCandidate({ AlertID: 'a2' });

    mockAlertRepo.getTemporaryCandidatesByFrequency
      .mockResolvedValueOnce({ items: [a1, a2] })
      .mockResolvedValueOnce({ items: [] });
    mockExchangeRepo.getById.mockResolvedValue(NASDAQ);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);
    (tradingHoursChecker.getLastTradingDate as jest.Mock).mockReturnValue('2026-03-04');
    mockAlertRepo.markTemporaryAsExpired
      .mockRejectedValueOnce(new Error('update failed'))
      .mockResolvedValueOnce(undefined);

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.statistics.errors).toBe(1);
    expect(body.statistics.deactivated).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      '一時通知アラートの失効処理でエラーが発生しました',
      expect.objectContaining({ alertId: 'a1', userId: 'u1' })
    );
  });

  it('getTemporaryCandidatesByFrequency でエラーが発生した場合は 500 を返す', async () => {
    mockAlertRepo.getTemporaryCandidatesByFrequency.mockRejectedValue(
      new Error('DynamoDB 接続エラー')
    );

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(500);
    expect(body.message).toBe('一時通知アラート失効バッチでエラーが発生しました');
    expect(body.error).toContain('DynamoDB 接続エラー');
  });

  it('ページ上限到達時にワーニングログを出し、HOURLY_LEVEL の処理を継続する', async () => {
    const minute = buildCandidate();
    const hourly = buildCandidate({ AlertID: 'h1', Frequency: 'HOURLY_LEVEL' });

    for (let i = 0; i < 20; i++) {
      mockAlertRepo.getTemporaryCandidatesByFrequency.mockResolvedValueOnce({
        items: [{ ...minute, AlertID: `m-${i}` }],
        nextCursor: `cursor-${i}`,
        count: 1,
      });
    }
    mockAlertRepo.getTemporaryCandidatesByFrequency.mockResolvedValueOnce({
      items: [hourly],
      nextCursor: undefined,
      count: 1,
    });
    mockExchangeRepo.getById.mockResolvedValue(NASDAQ);
    (tradingHoursChecker.isTradingHours as jest.Mock).mockReturnValue(false);
    (tradingHoursChecker.getLastTradingDate as jest.Mock).mockReturnValue('2026-03-04');

    const response = await handler(mockEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.statistics.totalAlerts).toBe(21);
    expect(mockAlertRepo.getTemporaryCandidatesByFrequency).toHaveBeenLastCalledWith(
      'HOURLY_LEVEL',
      { cursor: undefined }
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '一時通知アラート取得のページ上限に達したため途中終了します',
      expect.objectContaining({ frequency: 'MINUTE_LEVEL', maxPages: 20 })
    );
  });
});
