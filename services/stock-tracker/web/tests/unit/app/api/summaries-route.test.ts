import { GET } from '../../../../app/api/summaries/route';
import {
  createDailySummaryRepository,
  createExchangeRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';

jest.mock('../../../../lib/repository-factory', () => ({
  createDailySummaryRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
  createTickerRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
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

describe('GET /api/summaries', () => {
  const mockedCreateExchangeRepository = createExchangeRepository as MockedCreateExchangeRepository;
  const mockedCreateTickerRepository = createTickerRepository as MockedCreateTickerRepository;
  const mockedCreateDailySummaryRepository =
    createDailySummaryRepository as MockedCreateDailySummaryRepository;

  const mockGetAllExchanges = jest.fn();
  const mockGetAllTickers = jest.fn();
  const mockGetByExchange = jest.fn();

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
          CreatedAt: 1705276800000,
          UpdatedAt: 1705352400000,
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(new Request('http://localhost/api/summaries') as never);
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
              updatedAt: '2024-01-15T21:00:00.000Z',
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

  it('異常系: date パラメータが不正な場合は 400 を返す', async () => {
    const response = await GET(
      new Request('http://localhost/api/summaries?date=2024-13-40') as never
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'INVALID_DATE',
      message: '日付はYYYY-MM-DD形式で指定してください',
    });
    expect(mockGetAllExchanges).not.toHaveBeenCalled();
  });

  it('異常系: リポジトリアクセスエラー時は 500 を返す', async () => {
    mockGetAllExchanges.mockRejectedValue(new Error('db error'));

    const response = await GET(new Request('http://localhost/api/summaries') as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'サマリーの取得に失敗しました',
    });
  });
});
