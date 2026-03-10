import { NextRequest } from 'next/server';
import { GET } from '../../../../../app/api/summaries/route';
import {
  createDailySummaryRepository,
  createExchangeRepository,
  createHoldingRepository,
  createTickerRepository,
} from '../../../../../lib/repository-factory';

jest.mock('../../../../../lib/repository-factory', () => ({
  createDailySummaryRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
  createHoldingRepository: jest.fn(),
  createTickerRepository: jest.fn(),
}));

jest.mock('../../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { roles: ['stock-user'] } }, ...args);
  }),
}));

type MockedCreateExchangeRepository = jest.MockedFunction<typeof createExchangeRepository>;
type MockedCreateTickerRepository = jest.MockedFunction<typeof createTickerRepository>;
type MockedCreateDailySummaryRepository = jest.MockedFunction<typeof createDailySummaryRepository>;
type MockedCreateHoldingRepository = jest.MockedFunction<typeof createHoldingRepository>;

describe('GET /api/summaries', () => {
  const mockedCreateExchangeRepository = createExchangeRepository as MockedCreateExchangeRepository;
  const mockedCreateTickerRepository = createTickerRepository as MockedCreateTickerRepository;
  const mockedCreateDailySummaryRepository =
    createDailySummaryRepository as MockedCreateDailySummaryRepository;
  const mockedCreateHoldingRepository = createHoldingRepository as MockedCreateHoldingRepository;

  const mockGetAllExchanges = jest.fn();
  const mockGetAllTickers = jest.fn();
  const mockGetByExchange = jest.fn();
  const mockGetHoldingsByUserId = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockedCreateExchangeRepository.mockReturnValue({
      getAll: mockGetAllExchanges,
    } as ReturnType<typeof createExchangeRepository>);

    mockedCreateTickerRepository.mockReturnValue({
      getAll: mockGetAllTickers,
    } as ReturnType<typeof createTickerRepository>);

    mockedCreateDailySummaryRepository.mockReturnValue({
      getByExchange: mockGetByExchange,
    } as ReturnType<typeof createDailySummaryRepository>);

    mockedCreateHoldingRepository.mockReturnValue({
      getByUserId: mockGetHoldingsByUserId,
    } as ReturnType<typeof createHoldingRepository>);
  });

  it('正常系: 取引所ごとにサマリーを返す', async () => {
    mockGetAllExchanges.mockResolvedValue([
      {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
      },
      {
        ExchangeID: 'NYSE',
        Name: 'NYSE',
      },
    ]);

    mockGetAllTickers.mockResolvedValue({
      items: [
        {
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1,
          UpdatedAt: 1,
        },
      ],
    });

    mockGetByExchange
      .mockResolvedValueOnce([
        {
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Date: '2024-01-15',
          Open: 182.15,
          High: 183.92,
          Low: 181.44,
          Close: 183.31,
          Volume: 1234567,
          CreatedAt: 1705276800000,
          UpdatedAt: 1705352400000,
        },
      ])
      .mockResolvedValueOnce([]);
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
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
              patternDetails: [],
              holding: null,
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
    });
  });

  it('正常系: PatternResults がある場合はパターン情報を返す', async () => {
    mockGetAllExchanges.mockResolvedValue([
      {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
      },
    ]);

    mockGetAllTickers.mockResolvedValue({
      items: [
        {
          TickerID: 'NSDQ:AAPL',
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1,
          UpdatedAt: 1,
        },
      ],
    });

    mockGetByExchange.mockResolvedValue([
      {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2024-01-15',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        PatternResults: {
          'morning-star': 'MATCHED',
          'evening-star': 'NOT_MATCHED',
        },
        BuyPatternCount: 1,
        SellPatternCount: 0,
        CreatedAt: 1705276800000,
        UpdatedAt: 1705352400000,
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
    expect(body.exchanges[0].summaries[0].patternDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          patternId: 'morning-star',
          signalType: 'BUY',
          status: 'MATCHED',
        }),
        expect.objectContaining({
          patternId: 'evening-star',
          signalType: 'SELL',
          status: 'NOT_MATCHED',
        }),
      ])
    );
  });

  it('正常系: PatternResults がない場合はパターン情報のデフォルト値を返す', async () => {
    mockGetAllExchanges.mockResolvedValue([
      {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
      },
    ]);

    mockGetAllTickers.mockResolvedValue({
      items: [
        {
          TickerID: 'NSDQ:MSFT',
          Symbol: 'MSFT',
          Name: 'Microsoft Corporation',
          ExchangeID: 'NASDAQ',
          CreatedAt: 1,
          UpdatedAt: 1,
        },
      ],
    });

    mockGetByExchange.mockResolvedValue([
      {
        TickerID: 'NSDQ:MSFT',
        ExchangeID: 'NASDAQ',
        Date: '2024-01-15',
        Open: 401.01,
        High: 406.25,
        Low: 399.1,
        Close: 404.88,
        CreatedAt: 1705276800000,
        UpdatedAt: 1705352400000,
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
        patternDetails: [],
      })
    );
  });

  it('正常系: AiAnalysis がある場合は aiAnalysis として返す', async () => {
    mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
    mockGetAllTickers.mockResolvedValue({ items: [] });
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
    mockGetByExchange.mockResolvedValue([
      {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2024-01-15',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1705276800000,
        UpdatedAt: 1705352400000,
        AiAnalysis: '実データのAI解析',
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].summaries[0]).toEqual(
      expect.objectContaining({
        aiAnalysis: '実データのAI解析',
      })
    );
    expect(body.exchanges[0].summaries[0]).not.toHaveProperty('aiAnalysisError');
  });

  it('正常系: AiAnalysis と AiAnalysisError がない場合は両方とも返さない', async () => {
    mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
    mockGetAllTickers.mockResolvedValue({ items: [] });
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
    mockGetByExchange.mockResolvedValue([
      {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2024-01-15',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1705276800000,
        UpdatedAt: 1705352400000,
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].summaries[0]).not.toHaveProperty('aiAnalysis');
    expect(body.exchanges[0].summaries[0]).not.toHaveProperty('aiAnalysisError');
  });

  it('正常系: aiAnalysisError がある場合はその値を返す', async () => {
    mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
    mockGetAllTickers.mockResolvedValue({ items: [] });
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
    mockGetByExchange.mockResolvedValue([
      {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2024-01-15',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1705276800000,
        UpdatedAt: 1705352400000,
        AiAnalysisError: 'AI解析の生成に失敗しました',
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].summaries[0]).toEqual(
      expect.objectContaining({
        aiAnalysisError: 'AI解析の生成に失敗しました',
      })
    );
    expect(body.exchanges[0].summaries[0]).not.toHaveProperty('aiAnalysis');
  });

  it('正常系: aiAnalysis と aiAnalysisError が明示的に undefined の場合はそのまま返す', async () => {
    mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
    mockGetAllTickers.mockResolvedValue({ items: [] });
    mockGetHoldingsByUserId.mockResolvedValue({ items: [] });
    mockGetByExchange.mockResolvedValue([
      {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2024-01-15',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1705276800000,
        UpdatedAt: 1705352400000,
        AiAnalysis: undefined,
        AiAnalysisError: undefined,
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].summaries[0]).not.toHaveProperty('aiAnalysis');
    expect(body.exchanges[0].summaries[0]).not.toHaveProperty('aiAnalysisError');
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
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
      },
      {
        ExchangeID: 'NYSE',
        Name: 'NYSE',
      },
    ]);
    mockGetAllTickers.mockResolvedValue({ items: [] });
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
  });

  it('正常系: 保有株式情報がある場合は summaries に holding を含める', async () => {
    mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
    mockGetAllTickers.mockResolvedValue({ items: [] });
    mockGetByExchange.mockResolvedValue([
      {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2024-01-15',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1705276800000,
        UpdatedAt: 1705352400000,
      },
    ]);
    mockGetHoldingsByUserId.mockResolvedValue({
      items: [
        {
          UserID: 'test-user-id',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Quantity: 100,
          AveragePrice: 170.5,
          Currency: 'USD',
          CreatedAt: 1705276800000,
          UpdatedAt: 1705352400000,
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
    mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
    mockGetAllTickers.mockResolvedValue({ items: [] });
    mockGetByExchange.mockResolvedValue([
      {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2024-01-15',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1705276800000,
        UpdatedAt: 1705352400000,
      },
    ]);
    mockGetHoldingsByUserId.mockRejectedValue(new Error('holding db error'));

    const response = await GET(new NextRequest('http://localhost/api/summaries'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exchanges[0].summaries[0]).toEqual(
      expect.objectContaining({
        holding: null,
      })
    );
  });
});
