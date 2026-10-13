import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/alerts/tickers/[tickerId]/route';
import { createAlertRepository, createTickerRepository } from '../../../../lib/repository-factory';

jest.mock('../../../../lib/repository-factory', () => ({
  createAlertRepository: jest.fn(),
  createTickerRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  createApiErrorReporting: jest.requireActual('@nagiyu/nextjs').createApiErrorReporting,
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { id: 'test-user' } }, ...args);
  }),
  parsePagination: jest.fn(() => ({ limit: 50, cursor: undefined })),
}));

describe('GET /api/alerts/tickers/[tickerId]', () => {
  const mockGetByUserId = jest.fn();
  const mockGetTickerById = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createAlertRepository as jest.Mock).mockReturnValue({ getByUserId: mockGetByUserId });
    (createTickerRepository as jest.Mock).mockReturnValue({ getById: mockGetTickerById });
    mockGetTickerById.mockResolvedValue({ symbol: 'NVDA', name: 'NVIDIA' });
  });

  it('正常系: tickerId 指定時に該当アラートのみ返す', async () => {
    mockGetByUserId.mockResolvedValue({
      items: [
        {
          alertId: '1',
          tickerId: 'NASDAQ:NVDA',
          mode: 'Buy',
          frequency: 'MINUTE_LEVEL',
          conditionList: [{ field: 'price', operator: 'gte', value: 120 }],
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          alertId: '2',
          tickerId: 'NASDAQ:AAPL',
          mode: 'Sell',
          frequency: 'MINUTE_LEVEL',
          conditionList: [{ field: 'price', operator: 'lte', value: 100 }],
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const response = await GET(new NextRequest('http://localhost/api/alerts/tickers/NASDAQ:NVDA'), {
      params: Promise.resolve({ tickerId: 'NASDAQ:NVDA' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].tickerId).toBe('NASDAQ:NVDA');
  });

  it('異常系: tickerId 形式が不正な場合は 400 を返す', async () => {
    const response = await GET(new NextRequest('http://localhost/api/alerts/tickers/INVALID'), {
      params: Promise.resolve({ tickerId: 'INVALID' }),
    });
    expect(response.status).toBe(400);
  });
});
