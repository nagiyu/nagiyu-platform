import { NextRequest } from 'next/server';
import * as awsModule from '@nagiyu/aws';
import { GET } from '../../../../../app/api/summaries/route';
import {
  createAlertRepository,
  createDailySummaryRepository,
  createExchangeRepository,
  createForecastRepository,
  createHoldingRepository,
  createMarketForecastRepository,
  createPerformanceDailyRepository,
  createTickerRepository,
} from '../../../../../lib/repository-factory';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../../../lib/repository-factory', () => ({
  createDailySummaryRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
  createAlertRepository: jest.fn(),
  createHoldingRepository: jest.fn(),
  createTickerRepository: jest.fn(),
  createForecastRepository: jest.fn(),
  createMarketForecastRepository: jest.fn(),
  createPerformanceDailyRepository: jest.fn(),
}));

jest.mock('../../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  createApiErrorReporting: jest.requireActual('@nagiyu/nextjs').createApiErrorReporting,
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { roles: ['stock-user'] } }, ...args);
  }),
}));

type MockedCreateExchangeRepository = jest.MockedFunction<typeof createExchangeRepository>;
type MockedCreateTickerRepository = jest.MockedFunction<typeof createTickerRepository>;
type MockedCreateDailySummaryRepository = jest.MockedFunction<typeof createDailySummaryRepository>;
type MockedCreateAlertRepository = jest.MockedFunction<typeof createAlertRepository>;
type MockedCreateHoldingRepository = jest.MockedFunction<typeof createHoldingRepository>;

describe('GET /api/summaries', () => {
  const mockedCreateExchangeRepository = createExchangeRepository as MockedCreateExchangeRepository;
  const mockedCreateTickerRepository = createTickerRepository as MockedCreateTickerRepository;
  const mockedCreateDailySummaryRepository =
    createDailySummaryRepository as MockedCreateDailySummaryRepository;
  const mockedCreateAlertRepository = createAlertRepository as MockedCreateAlertRepository;
  const mockedCreateHoldingRepository = createHoldingRepository as MockedCreateHoldingRepository;

  const mockGetAllExchanges = jest.fn();
  const mockGetTickersByExchange = jest.fn();
  const mockGetAllTickers = jest.fn();
  // 取引所ごとの getByExchange が、その取引所の銘柄だけを返す挙動に揃える
  const setTickers = (tickers: Array<{ exchangeId: string }>): void => {
    mockGetTickersByExchange.mockImplementation(async (exchangeId: string) =>
      tickers.filter((ticker) => ticker.exchangeId === exchangeId)
    );
  };
  const mockGetByExchange = jest.fn();
  const mockGetAlertsByUserId = jest.fn();
  const mockGetHoldingsByUserId = jest.fn();
  const mockGetForecastsByExchangeAndDate = jest.fn();
  const mockGetMarketForecast = jest.fn();
  const mockGetPerformanceByPeriod = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetForecastsByExchangeAndDate.mockResolvedValue([]);
    mockGetMarketForecast.mockResolvedValue(null);
    mockGetPerformanceByPeriod.mockResolvedValue([]);
    (createForecastRepository as jest.Mock).mockReturnValue({
      getByExchangeAndDate: mockGetForecastsByExchangeAndDate,
    });
    (createMarketForecastRepository as jest.Mock).mockReturnValue({
      getByMarketAndDate: mockGetMarketForecast,
    });
    (createPerformanceDailyRepository as jest.Mock).mockReturnValue({
      getByPeriod: mockGetPerformanceByPeriod,
    });

    mockedCreateExchangeRepository.mockReturnValue({
      getAllIndexed: mockGetAllExchanges,
    } as ReturnType<typeof createExchangeRepository>);

    mockedCreateTickerRepository.mockReturnValue({
      getByExchange: mockGetTickersByExchange,
      getAll: mockGetAllTickers,
    } as ReturnType<typeof createTickerRepository>);

    mockedCreateDailySummaryRepository.mockReturnValue({
      getByExchange: mockGetByExchange,
    } as ReturnType<typeof createDailySummaryRepository>);

    mockedCreateAlertRepository.mockReturnValue({
      getByUserId: mockGetAlertsByUserId,
    } as ReturnType<typeof createAlertRepository>);

    mockedCreateHoldingRepository.mockReturnValue({
      getByUserId: mockGetHoldingsByUserId,
    } as ReturnType<typeof createHoldingRepository>);

    mockGetAlertsByUserId.mockResolvedValue({ items: [] });
  });

  it('正常系: 取引所ごとにサマリーを返す', async () => {
    mockGetAllExchanges.mockResolvedValue([
      {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
      },
      {
        exchangeId: 'NYSE',
        name: 'NYSE',
      },
    ]);

    setTickers([
      {
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    mockGetByExchange
      .mockResolvedValueOnce([
        {
          tickerId: 'NSDQ:AAPL',
          exchangeId: 'NASDAQ',
          date: '2024-01-15',
          open: 182.15,
          high: 183.92,
          low: 181.44,
          close: 183.31,
          volume: 1234567,
          createdAt: 1705276800000,
          updatedAt: 1705352400000,
        },
      ])
      .mockResolvedValueOnce([]);
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetTickersByExchange).toHaveBeenCalledTimes(2);
    expect(mockGetTickersByExchange).toHaveBeenCalledWith('NASDAQ');
    expect(mockGetTickersByExchange).toHaveBeenCalledWith('NYSE');
    expect(mockGetAllTickers).not.toHaveBeenCalled();
    expect(mockGetByExchange).toHaveBeenNthCalledWith(1, 'NASDAQ', undefined);
    expect(mockGetByExchange).toHaveBeenNthCalledWith(2, 'NYSE', undefined);
    expect(body).toEqual({
      exchanges: [
        {
          exchangeId: 'NASDAQ',
          exchangeName: 'NASDAQ',
          date: '2024-01-15',
          summaries: [
            {
              tickerId: 'NSDQ:AAPL',
              date: '2024-01-15',
              symbol: 'AAPL',
              name: 'Apple Inc.',
              open: 182.15,
              high: 183.92,
              low: 181.44,
              close: 183.31,
              volume: 1234567,
              updatedAt: '2024-01-15T21:00:00.000Z',
              buyPatternCount: 0,
              sellPatternCount: 0,
              buyAlertCount: {
                enabled: 0,
                disabled: 0,
              },
              sellAlertCount: {
                enabled: 0,
                disabled: 0,
              },
              holding: null,
              forecast: null,
            },
          ],
        },
        {
          exchangeId: 'NYSE',
          exchangeName: 'NYSE',
          date: null,
          summaries: [],
        },
      ],
      marketForecasts: [
        { market: 'JP', date: null, forecast: null },
        { market: 'US', date: null, forecast: null },
      ],
    });
  });

  it('正常系: patternResults がある場合はパターン情報を返す', async () => {
    mockGetAllExchanges.mockResolvedValue([
      {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
      },
    ]);

    setTickers([
      {
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    mockGetByExchange.mockResolvedValue([
      {
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        date: '2024-01-15',
        open: 182.15,
        high: 183.92,
        low: 181.44,
        close: 183.31,
        patternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        buyPatternCount: 1,
        sellPatternCount: 0,
        createdAt: 1705276800000,
        updatedAt: 1705352400000,
      },
    ]);
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].summaries[0]).toEqual(
      expect.objectContaining({
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        open: 182.15,
        high: 183.92,
        low: 181.44,
        close: 183.31,
        updatedAt: '2024-01-15T21:00:00.000Z',
        buyPatternCount: 1,
        sellPatternCount: 0,
      })
    );
    expect(body.exchanges[0].summaries[0]).not.toHaveProperty('patternDetails');
  });

  it('正常系: 銘柄ごとの買い/売りアラート件数を返す', async () => {
    mockGetAllExchanges.mockResolvedValue([{ exchangeId: 'NASDAQ', name: 'NASDAQ' }]);
    setTickers([
      { tickerId: 'NSDQ:AAPL', symbol: 'AAPL', name: 'Apple Inc.', exchangeId: 'NASDAQ' },
    ]);
    mockGetByExchange.mockResolvedValue([
      {
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        date: '2024-01-15',
        open: 182.15,
        high: 183.92,
        low: 181.44,
        close: 183.31,
        createdAt: 1705276800000,
        updatedAt: 1705352400000,
      },
    ]);
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
    mockGetAlertsByUserId.mockResolvedValue({
      items: [
        { tickerId: 'NSDQ:AAPL', mode: 'Buy', enabled: true },
        { tickerId: 'NSDQ:AAPL', mode: 'Buy', enabled: false },
        { tickerId: 'NSDQ:AAPL', mode: 'Sell', enabled: true },
        { tickerId: 'NSDQ:MSFT', mode: 'Buy', enabled: true },
      ],
    });

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].summaries[0]).toEqual(
      expect.objectContaining({
        buyAlertCount: { enabled: 1, disabled: 1 },
        sellAlertCount: { enabled: 1, disabled: 0 },
      })
    );
  });

  it('正常系: patternResults がない場合はパターン情報のデフォルト値を返す', async () => {
    mockGetAllExchanges.mockResolvedValue([
      {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
      },
    ]);

    setTickers([
      {
        tickerId: 'NSDQ:MSFT',
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        exchangeId: 'NASDAQ',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    mockGetByExchange.mockResolvedValue([
      {
        tickerId: 'NSDQ:MSFT',
        exchangeId: 'NASDAQ',
        date: '2024-01-15',
        open: 401.01,
        high: 406.25,
        low: 399.1,
        close: 404.88,
        createdAt: 1705276800000,
        updatedAt: 1705352400000,
      },
    ]);
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].summaries[0]).toEqual(
      expect.objectContaining({
        buyPatternCount: 0,
        sellPatternCount: 0,
      })
    );
  });

  it('正常系: パターン詳細は返さない', async () => {
    mockGetAllExchanges.mockResolvedValue([{ exchangeId: 'NASDAQ', name: 'NASDAQ' }]);
    setTickers([]);
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
    mockGetByExchange.mockResolvedValue([
      {
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        date: '2024-01-15',
        open: 182.15,
        high: 183.92,
        low: 181.44,
        close: 183.31,
        createdAt: 1705276800000,
        updatedAt: 1705352400000,
        patternResults: { 'morning-star': 'MATCHED' },
        buyPatternCount: 1,
        sellPatternCount: 0,
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    const summary = body.exchanges[0].summaries[0];
    expect(summary).not.toHaveProperty('patternDetails');
    expect(summary).toEqual(expect.objectContaining({ buyPatternCount: 1, sellPatternCount: 0 }));
  });

  it('異常系: date パラメータが不正な場合は 400 を返す', async () => {
    const response = await GET(new NextRequest('http://localhost/api/summaries?date=2024-13-40'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_DATE',
      message: '日付はYYYY-MM-DD形式で指定してください',
    });
    expect(mockGetAllExchanges).not.toHaveBeenCalled();
  });

  it('異常系: 存在しない日付の場合は 400 を返す', async () => {
    const response = await GET(new NextRequest('http://localhost/api/summaries?date=2024-02-30'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_DATE',
      message: '日付はYYYY-MM-DD形式で指定してください',
    });
    expect(mockGetAllExchanges).not.toHaveBeenCalled();
  });

  it('正常系: date パラメータ指定時は全取引所に同じ日付で問い合わせる', async () => {
    mockGetAllExchanges.mockResolvedValue([
      {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ',
      },
      {
        exchangeId: 'NYSE',
        name: 'NYSE',
      },
    ]);
    setTickers([]);
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
    mockGetByExchange.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/summaries?date=2024-01-15'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetByExchange).toHaveBeenNthCalledWith(1, 'NASDAQ', '2024-01-15');
    expect(mockGetByExchange).toHaveBeenNthCalledWith(2, 'NYSE', '2024-01-15');
    expect(body).toEqual({
      exchanges: [
        {
          exchangeId: 'NASDAQ',
          exchangeName: 'NASDAQ',
          date: '2024-01-15',
          summaries: [],
        },
        {
          exchangeId: 'NYSE',
          exchangeName: 'NYSE',
          date: '2024-01-15',
          summaries: [],
        },
      ],
      marketForecasts: [
        { market: 'JP', date: '2024-01-15', forecast: null },
        { market: 'US', date: '2024-01-15', forecast: null },
      ],
    });
  });

  it('異常系: リポジトリアクセスエラー時は 500 を返す', async () => {
    mockGetAllExchanges.mockRejectedValue(new Error('db error'));

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'サマリーの取得に失敗しました',
    });
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: サマリー一覧取得エラー',
        message: 'db error',
      })
    );
  });

  it('正常系: 保有株式情報がある場合は summaries に holding を含める', async () => {
    mockGetAllExchanges.mockResolvedValue([{ exchangeId: 'NASDAQ', name: 'NASDAQ' }]);
    setTickers([]);
    mockGetByExchange.mockResolvedValue([
      {
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        date: '2024-01-15',
        open: 182.15,
        high: 183.92,
        low: 181.44,
        close: 183.31,
        createdAt: 1705276800000,
        updatedAt: 1705352400000,
      },
    ]);
    mockGetHoldingsByUserId.mockResolvedValue({
      items: [
        {
          userId: 'test-user-id',
          tickerId: 'NSDQ:AAPL',
          exchangeId: 'NASDAQ',
          quantity: 100,
          averagePrice: 170.5,
          currency: 'USD',
          createdAt: 1705276800000,
          updatedAt: 1705352400000,
        },
      ],
    });

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].summaries[0]).toEqual(
      expect.objectContaining({
        holding: {
          quantity: 100,
          averagePrice: 170.5,
        },
      })
    );
  });

  it('正常系: 保有株式情報の取得に失敗してもサマリー取得を継続する', async () => {
    mockGetAllExchanges.mockResolvedValue([{ exchangeId: 'NASDAQ', name: 'NASDAQ' }]);
    setTickers([]);
    mockGetByExchange.mockResolvedValue([
      {
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        date: '2024-01-15',
        open: 182.15,
        high: 183.92,
        low: 181.44,
        close: 183.31,
        createdAt: 1705276800000,
        updatedAt: 1705352400000,
      },
    ]);
    mockGetHoldingsByUserId.mockRejectedValue(new Error('holding db error'));

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: サマリーの保有株式取得エラー',
        message: 'holding db error',
      })
    );
    expect(body.exchanges[0].summaries[0]).toEqual(
      expect.objectContaining({
        holding: null,
      })
    );
  });

  describe('確度の結合', () => {
    const summary = (tickerId: string, exchangeId: string, date: string) => ({
      tickerId: tickerId,
      exchangeId: exchangeId,
      date: date,
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      createdAt: 1,
      updatedAt: 1,
    });

    it('正常系: 取引所ごとに 1 回だけ Forecast を引いて銘柄へ結合する', async () => {
      mockGetAllExchanges.mockResolvedValue([
        { exchangeId: 'NASDAQ', name: 'NASDAQ', market: 'US' },
        { exchangeId: 'TSE', name: 'TSE', market: 'JP' },
      ]);
      setTickers([]);
      mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
      mockGetByExchange
        .mockResolvedValueOnce([
          summary('NSDQ:AAPL', 'NASDAQ', '2024-01-15'),
          summary('NSDQ:MSFT', 'NASDAQ', '2024-01-15'),
        ])
        .mockResolvedValueOnce([summary('TSE:7203', 'TSE', '2024-01-16')]);
      mockGetForecastsByExchangeAndDate.mockImplementation(async (exchangeId: string) =>
        exchangeId === 'NASDAQ'
          ? [
              {
                tickerId: 'NSDQ:AAPL',
                axisValues: { 'morning-star': true, 'bearish-engulfing': 1 },
                probabilities: {
                  DIR: {
                    probability: 0.56,
                    baseline: 0.5,
                    lean: 'UP',
                    neutralBand: { lower: -0.05, upper: 0.05 },
                    bandHistory: null,
                    contributions: {},
                    lowSampleAxes: [],
                  },
                },
              },
            ]
          : []
      );
      mockGetMarketForecast.mockImplementation(async (market: string) =>
        market === 'JP'
          ? {
              probabilities: {
                MKT: {
                  probability: 0.4,
                  baseline: 0.3,
                  lean: 'HIGH',
                  neutralBand: { lower: 0, upper: 0.1 },
                  bandHistory: null,
                  contributions: {},
                  lowSampleAxes: [],
                },
              },
            }
          : null
      );
      mockGetPerformanceByPeriod.mockResolvedValue([{ evaluatedCount: 3 }, { evaluatedCount: 0 }]);

      const response = await GET(new NextRequest('http://localhost/api/summaries'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(mockGetForecastsByExchangeAndDate).toHaveBeenCalledTimes(2);
      expect(mockGetForecastsByExchangeAndDate).toHaveBeenCalledWith('NASDAQ', '2024-01-15');
      expect(mockGetForecastsByExchangeAndDate).toHaveBeenCalledWith('TSE', '2024-01-16');
      expect(body.exchanges[0].summaries[0].forecast).toEqual({
        dir: { probability: 0.56, baseline: 0.5, lean: 'UP' },
        vol: null,
        lit: { total: 2, buy: 1, sell: 1 },
      });
      expect(body.exchanges[0].summaries[1].forecast).toBeNull();
      expect(body.marketForecasts).toEqual([
        {
          market: 'JP',
          date: '2024-01-16',
          forecast: { probability: 0.4, baseline: 0.3, lean: 'HIGH', lowSample: true },
        },
        { market: 'US', date: '2024-01-15', forecast: null },
      ]);
      expect(mockGetPerformanceByPeriod).toHaveBeenCalledWith(
        'MKT',
        'JP',
        '0000-01-01',
        '2024-01-15'
      );
    });

    it('正常系: Forecast の取得に失敗しても一覧を返す', async () => {
      mockGetAllExchanges.mockResolvedValue([
        { exchangeId: 'NASDAQ', name: 'NASDAQ', market: 'US' },
      ]);
      setTickers([]);
      mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
      mockGetByExchange.mockResolvedValue([summary('NSDQ:AAPL', 'NASDAQ', '2024-01-15')]);
      mockGetForecastsByExchangeAndDate.mockRejectedValue(new Error('forecast db error'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await GET(new NextRequest('http://localhost/api/summaries'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.exchanges[0].summaries[0].forecast).toBeNull();
      expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'stock-tracker',
          severity: 'error',
          title: 'Web API: サマリーの確度取得エラー',
          message: 'forecast db error',
        })
      );
    });

    it('正常系: 市場の荒れ予報の取得に失敗しても一覧を返し、JP・US を null で返す', async () => {
      mockGetAllExchanges.mockResolvedValue([
        { exchangeId: 'NASDAQ', name: 'NASDAQ', market: 'US' },
      ]);
      setTickers([]);
      mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
      mockGetByExchange.mockResolvedValue([summary('NSDQ:AAPL', 'NASDAQ', '2024-01-15')]);
      mockGetMarketForecast.mockRejectedValue(new Error('market db error'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await GET(new NextRequest('http://localhost/api/summaries'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.marketForecasts).toEqual([
        { market: 'JP', date: null, forecast: null },
        { market: 'US', date: null, forecast: null },
      ]);
      expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'stock-tracker',
          severity: 'error',
          title: 'Web API: サマリーの市場の荒れ予報取得エラー',
          message: 'market db error',
        })
      );
    });
  });
});
