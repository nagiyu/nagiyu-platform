import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/tickers/route';
import { createTickerRepository } from '../../../../lib/repository-factory';

jest.mock('../../../../lib/repository-factory', () => ({
  createTickerRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
  handleApiError: jest.fn((error) => {
    throw error;
  }),
}));

function buildTicker(tickerId: string, exchangeId: string) {
  return {
    TickerID: tickerId,
    Symbol: tickerId,
    Name: tickerId,
    ExchangeID: exchangeId,
    CreatedAt: 1704067200000,
    UpdatedAt: 1704067200000,
  };
}

describe('GET /api/tickers', () => {
  const mockGetByExchange = jest.fn();
  const mockGetAll = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createTickerRepository as jest.Mock).mockReturnValue({
      getByExchange: mockGetByExchange,
      getAll: mockGetAll,
    });
  });

  it('exchangeId指定時、51件以上でもページネーションせず全件返す（Issue #3788）', async () => {
    const total = 51;
    const tickers = Array.from({ length: total }, (_, i) =>
      buildTicker(`NSDQ:T${String(i).padStart(4, '0')}`, 'NASDAQ')
    );
    mockGetByExchange.mockResolvedValue(tickers);

    const request = new NextRequest('http://localhost/api/tickers?exchangeId=NASDAQ');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickers).toHaveLength(total);
    expect(body.pagination).toBeUndefined();
    expect(mockGetByExchange).toHaveBeenCalledWith('NASDAQ');
  });

  it('exchangeId未指定時、getAllの全件を返す', async () => {
    const total = 51;
    const tickers = Array.from({ length: total }, (_, i) =>
      buildTicker(`NSDQ:T${String(i).padStart(4, '0')}`, 'NASDAQ')
    );
    mockGetAll.mockResolvedValue({ items: tickers, nextCursor: undefined, count: total });

    const request = new NextRequest('http://localhost/api/tickers');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickers).toHaveLength(total);
    expect(body.pagination).toBeUndefined();
    expect(mockGetAll).toHaveBeenCalledWith();
  });

  it('レスポンスのティッカーが期待する形式に変換される', async () => {
    mockGetByExchange.mockResolvedValue([buildTicker('NSDQ:AAPL', 'NASDAQ')]);

    const request = new NextRequest('http://localhost/api/tickers?exchangeId=NASDAQ');
    const response = await GET(request);
    const body = await response.json();

    expect(body.tickers).toEqual([
      { tickerId: 'NSDQ:AAPL', symbol: 'NSDQ:AAPL', name: 'NSDQ:AAPL', exchangeId: 'NASDAQ' },
    ]);
  });
});
