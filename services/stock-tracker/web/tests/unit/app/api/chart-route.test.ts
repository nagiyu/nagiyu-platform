import { NextRequest } from 'next/server';
import * as awsModule from '@nagiyu/aws';
import { errorReporter } from '../../../../lib/api-error-reporting';
import { GET } from '../../../../app/api/chart/[tickerId]/route';

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

jest.mock('@nagiyu/stock-tracker-core', () => ({
  getChartData: jest.fn(),
  createHoldingRepository: jest.fn(),
  SUPPORTED_TIMEFRAMES: ['60', 'D'],
  TRADINGVIEW_ERROR_MESSAGES: {
    TIMEOUT: 'timeout',
    RATE_LIMIT: 'rate limit',
    INVALID_TICKER: 'invalid ticker',
  },
}));

jest.mock('@nagiyu/nextjs', () => ({
  createApiErrorReporting: jest.requireActual('@nagiyu/nextjs').createApiErrorReporting,
  getAuthError: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

import { getChartData, createHoldingRepository } from '@nagiyu/stock-tracker-core';
import { getAuthError } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';

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
        id: 'test-user',
        email: 'test@example.com',
        name: 'Test',
        roles: ['stock-user'],
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
      getById: jest.fn().mockResolvedValue({ quantity: 10, averagePrice: 200 }),
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
    expect(errorReporter.report).toHaveBeenCalledWith(
      'Web API: チャートの保有情報取得エラー',
      expect.objectContaining({ message: 'holding failed' }),
      { context: { tickerId: 'NSDQ:NVDA' } }
    );
    consoleErrorSpy.mockRestore();
  });

  it('想定外のエラーは 500 を返して報告する', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGetChartData.mockRejectedValue(new Error('unexpected failure'));

    const response = await GET(
      new NextRequest('http://localhost/api/chart/NSDQ:NVDA?timeframe=60'),
      {
        params: Promise.resolve({ tickerId: 'NSDQ:NVDA' }),
      }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'チャートデータの取得に失敗しました',
    });
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: チャートデータ取得エラー',
        message: 'unexpected failure',
      })
    );
    consoleErrorSpy.mockRestore();
  });

  it('TradingView のタイムアウトは 504 を返し、報告しない', async () => {
    mockedGetChartData.mockRejectedValue(new Error('timeout'));

    const response = await GET(
      new NextRequest('http://localhost/api/chart/NSDQ:NVDA?timeframe=60'),
      {
        params: Promise.resolve({ tickerId: 'NSDQ:NVDA' }),
      }
    );

    expect(response.status).toBe(504);
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });
});
