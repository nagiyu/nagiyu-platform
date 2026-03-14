import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/holdings/tickers/[tickerId]/route';
import {
  createHoldingRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';

jest.mock('../../../../lib/repository-factory', () => ({
  createHoldingRepository: jest.fn(),
  createTickerRepository: jest.fn(),
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

describe('GET /api/holdings/tickers/[tickerId]', () => {
  const mockGetHoldingById = jest.fn();
  const mockGetTickerById = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createHoldingRepository as jest.Mock).mockReturnValue({ getById: mockGetHoldingById });
    (createTickerRepository as jest.Mock).mockReturnValue({ getById: mockGetTickerById });
  });

  it('正常系: ティッカーIDで保有情報を返す', async () => {
    mockGetHoldingById.mockResolvedValue({
      UserID: 'test-user',
      TickerID: 'NASDAQ:NVDA',
      Quantity: 5,
      AveragePrice: 98,
      Currency: 'USD',
      CreatedAt: 1,
      UpdatedAt: 2,
    });
    mockGetTickerById.mockResolvedValue({ Symbol: 'NVDA', Name: 'NVIDIA' });

    const response = await GET(
      new NextRequest('http://localhost/api/holdings/tickers/NASDAQ:NVDA'),
      {
        params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickerId).toBe('NASDAQ:NVDA');
    expect(body.averagePrice).toBe(98);
  });

  it('異常系: ティッカーID形式が不正な場合は 400 を返す', async () => {
    const response = await GET(new NextRequest('http://localhost/api/holdings/tickers/INVALID'), {
      params: Promise.resolve({ tickerId: 'INVALID' }),
    });

    expect(response.status).toBe(400);
  });

  it('異常系: 保有情報が存在しない場合は 404 を返す', async () => {
    mockGetHoldingById.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/holdings/tickers/NASDAQ:NVDA'),
      {
        params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }),
      }
    );

    expect(response.status).toBe(404);
  });
});
