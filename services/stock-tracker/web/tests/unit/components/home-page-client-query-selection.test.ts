/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import HomePageClient from '../../../components/HomePageClient';
import type { StockChartProps } from '../../../components/StockChart';

let currentSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => currentSearchParams,
}));

jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: ({ tickerId, holdingPrice, alertLines }: StockChartProps) =>
    React.createElement(
      'div',
      {
        'data-testid': 'stock-chart',
        'data-holding-price': holdingPrice ?? '',
        'data-alert-lines': String(alertLines?.length ?? 0),
      },
      tickerId
    ),
}));

jest.mock('@nagiyu/ui', () => ({
  __esModule: true,
  ErrorAlert: ({ message }: { message: string }) =>
    React.createElement('div', { role: 'alert' }, message),
}));

jest.mock('../../../components/EmptyState', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-testid': 'empty-state' }, title),
}));

describe('HomePageClient クエリ初期選択', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url === '/api/exchanges') {
        return {
          ok: true,
          json: async () => ({
            exchanges: [
              {
                exchangeId: 'NASDAQ',
                name: 'NASDAQ',
                key: 'NASDAQ',
                timezone: 'America/New_York',
                tradingHours: { start: '09:30', end: '16:00' },
              },
            ],
          }),
        } as Response;
      }

      if (url === '/api/tickers?exchangeId=NASDAQ') {
        return {
          ok: true,
          json: async () => ({
            tickers: [
              {
                tickerId: 'NASDAQ:AAPL',
                symbol: 'AAPL',
                name: 'Apple',
                exchangeId: 'NASDAQ',
              },
            ],
          }),
        } as Response;
      }

      if (url === '/api/summaries/NASDAQ:AAPL') {
        return {
          ok: true,
          json: async () => ({
            tickerId: 'NASDAQ:AAPL',
            symbol: 'AAPL',
            name: 'Apple',
            open: 100,
            high: 110,
            low: 95,
            close: 105,
            updatedAt: '2026-01-01T00:00:00.000Z',
            buyPatternCount: 1,
            sellPatternCount: 0,
            buyAlertCount: { enabled: 1, disabled: 0 },
            sellAlertCount: { enabled: 0, disabled: 0 },
            patternDetails: [],
            holding: { quantity: 5, averagePrice: 98 },
          }),
        } as Response;
      }

      if (url === '/api/holdings/tickers/NASDAQ%3AAAPL') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            holdingId: 'test-user#NASDAQ:AAPL',
            tickerId: 'NASDAQ:AAPL',
            symbol: 'AAPL',
            name: 'Apple',
            quantity: 5,
            averagePrice: 98,
            currency: 'USD',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }),
        } as Response;
      }

      if (url === '/api/alerts/tickers/NASDAQ%3AAAPL') {
        return {
          ok: true,
          json: async () => ({
            alerts: [
              {
                alertId: 'alert-1',
                tickerId: 'NASDAQ:AAPL',
                symbol: 'AAPL',
                name: 'Apple',
                mode: 'Buy',
                frequency: 'MINUTE_LEVEL',
                conditions: [{ field: 'price', operator: 'gte', value: 120 }],
                enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ tickers: [] }),
      } as Response;
    });

    global.fetch = fetchMock;
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    currentSearchParams = new URLSearchParams();
  });

  it('exchangeId/tickerId クエリが有効なとき初期選択される', async () => {
    currentSearchParams = new URLSearchParams('exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL');

    render(React.createElement(HomePageClient));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/exchanges'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/tickers?exchangeId=NASDAQ'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/summaries/NASDAQ:AAPL'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/holdings/tickers/NASDAQ%3AAAPL')
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/alerts/tickers/NASDAQ%3AAAPL')
    );
    await waitFor(() => expect(screen.getByTestId('stock-chart').textContent).toBe('NASDAQ:AAPL'));
    expect(screen.getByTestId('stock-chart').getAttribute('data-holding-price')).toBe('98');
    expect(screen.getByTestId('stock-chart').getAttribute('data-alert-lines')).toBe('1');
  });

  it('存在しない exchangeId クエリは無視される', async () => {
    currentSearchParams = new URLSearchParams('exchangeId=UNKNOWN&tickerId=NASDAQ%3AAAPL');

    render(React.createElement(HomePageClient));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/exchanges'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('stock-chart')).toBeNull();
    expect(screen.getByTestId('empty-state').textContent).toContain('チャート表示エリア');
  });
});
