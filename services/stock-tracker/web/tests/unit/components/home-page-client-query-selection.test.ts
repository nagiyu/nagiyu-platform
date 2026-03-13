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
  default: ({ tickerId }: StockChartProps) =>
    React.createElement('div', { 'data-testid': 'stock-chart' }, tickerId),
}));

jest.mock('../../../components/ErrorAlert', () => ({
  __esModule: true,
  default: ({ message }: { message: string }) =>
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
    await waitFor(() => expect(screen.getByTestId('stock-chart').textContent).toBe('NASDAQ:AAPL'));
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
