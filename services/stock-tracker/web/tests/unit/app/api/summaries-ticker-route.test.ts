import { GET } from '../../../../app/api/summaries/[tickerId]/route';
import {
  createAlertRepository,
  createDailySummaryRepository,
  createHoldingRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';

jest.mock('../../../../lib/repository-factory', () => ({
  createDailySummaryRepository: jest.fn(),
  createAlertRepository: jest.fn(),
  createHoldingRepository: jest.fn(),
  createTickerRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) =>
      handler({ user: { userId: 'test-user', roles: ['stock-user'] } }, ...args);
  }),
}));

describe('GET /api/summaries/[tickerId]', () => {
  const mockGetByExchange = jest.fn();
  const mockGetById = jest.fn();
  const mockGetHoldingById = jest.fn();
  const mockGetAlertsByUserId = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
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
        TickerID: 'NASDAQ:NVDA',
        ExchangeID: 'NASDAQ',
        Date: '2026-01-01',
        Open: 100,
        High: 120,
        Low: 90,
        Close: 110,
        Volume: 1000,
        CreatedAt: 1,
        UpdatedAt: 1000,
      },
    ]);
    mockGetById.mockResolvedValue({ TickerID: 'NASDAQ:NVDA', Symbol: 'NVDA', Name: 'NVIDIA' });
    mockGetHoldingById.mockResolvedValue({ Quantity: 5, AveragePrice: 98 });
    mockGetAlertsByUserId.mockResolvedValue({
      items: [{ TickerID: 'NASDAQ:NVDA', Mode: 'Buy', Enabled: true }],
    });

    const response = await GET(
      new Request('http://localhost/api/summaries/NASDAQ:NVDA'),
      { params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickerId).toBe('NASDAQ:NVDA');
    expect(body.holding).toEqual({ quantity: 5, averagePrice: 98 });
    expect(body.buyAlertCount).toEqual({ enabled: 1, disabled: 0 });
  });

  it('異常系: tickerId が不正な場合は 400 を返す', async () => {
    const response = await GET(
      new Request('http://localhost/api/summaries/INVALID'),
      { params: Promise.resolve({ tickerId: 'INVALID' }) }
    );

    expect(response.status).toBe(400);
  });

  it('異常系: サマリーが存在しない場合は 404 を返す', async () => {
    mockGetByExchange.mockResolvedValue([]);
    mockGetById.mockResolvedValue(null);
    mockGetHoldingById.mockResolvedValue(null);
    mockGetAlertsByUserId.mockResolvedValue({ items: [] });

    const response = await GET(
      new Request('http://localhost/api/summaries/NASDAQ:NVDA'),
      { params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }) }
    );

    expect(response.status).toBe(404);
  });
});
