import { GET } from '../../../../app/api/summaries/[tickerId]/route';
import * as awsModule from '@nagiyu/aws';
import { errorReporter } from '../../../../lib/api-error-reporting';
import {
  createAlertRepository,
  createDailySummaryRepository,
  createForecastRepository,
  createHoldingRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../../lib/api-error-reporting', () => ({
  ...jest.requireActual('../../../../lib/api-error-reporting'),
  errorReporter: {
    report: jest.fn().mockResolvedValue(null),
    onError: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../../../../lib/repository-factory', () => ({
  createDailySummaryRepository: jest.fn(),
  createAlertRepository: jest.fn(),
  createHoldingRepository: jest.fn(),
  createTickerRepository: jest.fn(),
  createForecastRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  createApiErrorReporting: jest.requireActual('@nagiyu/nextjs').createApiErrorReporting,
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) =>
      handler({ user: { id: 'test-user', roles: ['stock-user'] } }, ...args);
  }),
}));

describe('GET /api/summaries/[tickerId]', () => {
  const mockGetByExchange = jest.fn();
  const mockGetById = jest.fn();
  const mockGetHoldingById = jest.fn();
  const mockGetAlertsByUserId = jest.fn();
  const mockGetForecast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetForecast.mockResolvedValue(null);
    (createForecastRepository as jest.Mock).mockReturnValue({
      getByTickerAndDate: mockGetForecast,
    });
    (createDailySummaryRepository as jest.Mock).mockReturnValue({
      getByExchange: mockGetByExchange,
    });
    (createTickerRepository as jest.Mock).mockReturnValue({
      getById: mockGetById,
    });
    (createHoldingRepository as jest.Mock).mockReturnValue({
      getById: mockGetHoldingById,
    });
    (createAlertRepository as jest.Mock).mockReturnValue({
      getByUserId: mockGetAlertsByUserId,
    });
  });

  it('正常系: 指定ティッカーのサマリーを返す', async () => {
    mockGetByExchange.mockResolvedValue([
      {
        tickerId: 'NASDAQ:NVDA',
        exchangeId: 'NASDAQ',
        date: '2026-01-01',
        open: 100,
        high: 120,
        low: 90,
        close: 110,
        volume: 1000,
        createdAt: 1,
        updatedAt: 1000,
      },
    ]);
    mockGetById.mockResolvedValue({ tickerId: 'NASDAQ:NVDA', symbol: 'NVDA', name: 'NVIDIA' });
    mockGetHoldingById.mockResolvedValue({ quantity: 5, averagePrice: 98 });
    mockGetAlertsByUserId.mockResolvedValue({
      items: [{ tickerId: 'NASDAQ:NVDA', mode: 'Buy', enabled: true }],
    });

    const response = await GET(new Request('http://localhost/api/summaries/NASDAQ:NVDA'), {
      params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickerId).toBe('NASDAQ:NVDA');
    expect(body.holding).toEqual({ quantity: 5, averagePrice: 98 });
    expect(body.buyAlertCount).toEqual({ enabled: 1, disabled: 0 });
    expect(body.forecast).toBeNull();
    expect(mockGetForecast).toHaveBeenCalledWith('NASDAQ:NVDA', '2026-01-01');
  });

  it('正常系: Forecast があれば forecast に要約を含める', async () => {
    mockGetByExchange.mockResolvedValue([
      {
        tickerId: 'NASDAQ:NVDA',
        exchangeId: 'NASDAQ',
        date: '2026-01-01',
        open: 100,
        high: 120,
        low: 90,
        close: 110,
        createdAt: 1,
        updatedAt: 1000,
      },
    ]);
    mockGetById.mockResolvedValue({ tickerId: 'NASDAQ:NVDA', symbol: 'NVDA', name: 'NVIDIA' });
    mockGetHoldingById.mockResolvedValue(null);
    mockGetAlertsByUserId.mockResolvedValue({ items: [] });
    mockGetForecast.mockResolvedValue({
      tickerId: 'NASDAQ:NVDA',
      axisValues: { 'morning-star': true },
      probabilities: {
        VOL: {
          probability: 0.6,
          baseline: 0.4,
          lean: 'HIGH',
          neutralBand: { lower: 0, upper: 0.05 },
          bandHistory: null,
          contributions: {},
          lowSampleAxes: [],
        },
      },
    });

    const response = await GET(new Request('http://localhost/api/summaries/NASDAQ:NVDA'), {
      params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.forecast).toEqual({
      dir: null,
      vol: { probability: 0.6, baseline: 0.4, lean: 'HIGH' },
      lit: { total: 1, buy: 1, sell: 0 },
    });
  });

  it('正常系: Forecast の取得に失敗してもサマリーを返す', async () => {
    mockGetByExchange.mockResolvedValue([
      {
        tickerId: 'NASDAQ:NVDA',
        exchangeId: 'NASDAQ',
        date: '2026-01-01',
        open: 100,
        high: 120,
        low: 90,
        close: 110,
        createdAt: 1,
        updatedAt: 1000,
      },
    ]);
    mockGetById.mockResolvedValue(null);
    mockGetHoldingById.mockResolvedValue(null);
    mockGetAlertsByUserId.mockResolvedValue({ items: [] });
    mockGetForecast.mockRejectedValue(new Error('forecast db error'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await GET(new Request('http://localhost/api/summaries/NASDAQ:NVDA'), {
      params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.forecast).toBeNull();
    expect(errorReporter.report).toHaveBeenCalledWith(
      'Web API: サマリーの確度取得エラー',
      expect.objectContaining({ message: 'forecast db error' }),
      { context: { tickerId: 'NASDAQ:NVDA' } }
    );
  });

  it('異常系: リポジトリが失敗したら 500 を返して報告する', async () => {
    mockGetByExchange.mockRejectedValue(new Error('db error'));
    mockGetById.mockResolvedValue(null);
    mockGetHoldingById.mockResolvedValue(null);
    mockGetAlertsByUserId.mockResolvedValue({ items: [] });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await GET(new Request('http://localhost/api/summaries/NASDAQ:NVDA'), {
      params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'サマリーの取得に失敗しました',
    });
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: サマリー取得エラー',
        message: 'db error',
      })
    );
  });

  it('異常系: tickerId が不正な場合は 400 を返す', async () => {
    const response = await GET(new Request('http://localhost/api/summaries/INVALID'), {
      params: Promise.resolve({ tickerId: 'INVALID' }),
    });

    expect(response.status).toBe(400);
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it('異常系: サマリーが存在しない場合は 404 を返す', async () => {
    mockGetByExchange.mockResolvedValue([]);
    mockGetById.mockResolvedValue(null);
    mockGetHoldingById.mockResolvedValue(null);
    mockGetAlertsByUserId.mockResolvedValue({ items: [] });

    const response = await GET(new Request('http://localhost/api/summaries/NASDAQ:NVDA'), {
      params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }),
    });

    expect(response.status).toBe(404);
  });
});
