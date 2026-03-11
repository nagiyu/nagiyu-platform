import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/chart/[tickerId]/route';

jest.mock('@nagiyu/stock-tracker-core', () => ({
  getChartData: jest.fn(),
  getAuthError: jest.fn(),
  SUPPORTED_TIMEFRAMES: ['60', 'D'],
  TRADINGVIEW_ERROR_MESSAGES: {
    TIMEOUT: 'timeout',
    RATE_LIMIT: 'rate limit',
    INVALID_TICKER: 'invalid ticker',
  },
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('../../../../lib/repository-factory', () => ({
  createHoldingRepository: jest.fn(),
}));

import { getChartData, getAuthError } from '@nagiyu/stock-tracker-core';
import { getSession } from '../../../../lib/auth';
import { createHoldingRepository } from '../../../../lib/repository-factory';

const mockedGetChartData = getChartData as jest.MockedFunction<typeof getChartData>;
const mockedGetAuthError = getAuthError as jest.MockedFunction<typeof getAuthError>;
const mockedGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockedCreateHoldingRepository = createHoldingRepository as jest.MockedFunction<
  typeof createHoldingRepository
>;

describe('/api/chart/[tickerId] GET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetSession.mockResolvedValue({
      user: {
        userId: 'test-user',
        googleId: 'g',
        email: 'test@example.com',
        name: 'Test',
        roles: ['stock-user'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      expires: '2026-12-31T00:00:00.000Z',
    });
    mockedGetAuthError.mockReturnValue(null);
    mockedGetChartData.mockResolvedValue([
      { time: 1, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    ]);
  });

  it('保有がある場合は holdingAveragePrice を返す', async () => {
    mockedCreateHoldingRepository.mockReturnValue({
      getById: jest.fn().mockResolvedValue({ Quantity: 10, AveragePrice: 200 }),
    } as never);

    const response = await GET(
      new NextRequest('http://localhost/api/chart/NSDQ:NVDA?timeframe=60'),
      {
        params: Promise.resolve({ tickerId: 'NSDQ:NVDA' }),
      }
    );
    const body = (await response.json()) as { holdingAveragePrice?: number };

    expect(response.status).toBe(200);
    expect(body.holdingAveragePrice).toBe(200);
  });

  it('保有がない場合は holdingAveragePrice を返さない', async () => {
    mockedCreateHoldingRepository.mockReturnValue({
      getById: jest.fn().mockResolvedValue(null),
    } as never);

    const response = await GET(
      new NextRequest('http://localhost/api/chart/NSDQ:NVDA?timeframe=60'),
      {
        params: Promise.resolve({ tickerId: 'NSDQ:NVDA' }),
      }
    );
    const body = (await response.json()) as { holdingAveragePrice?: number };

    expect(response.status).toBe(200);
    expect(body.holdingAveragePrice).toBeUndefined();
  });

  it('保有取得でエラーが発生してもチャートデータは返す', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedCreateHoldingRepository.mockReturnValue({
      getById: jest.fn().mockRejectedValue(new Error('holding failed')),
    } as never);

    const response = await GET(
      new NextRequest('http://localhost/api/chart/NSDQ:NVDA?timeframe=60'),
      {
        params: Promise.resolve({ tickerId: 'NSDQ:NVDA' }),
      }
    );
    const body = (await response.json()) as { data?: unknown[]; holdingAveragePrice?: number };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.holdingAveragePrice).toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
