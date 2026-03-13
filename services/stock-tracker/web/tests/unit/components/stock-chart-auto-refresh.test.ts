/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import StockChart from '../../../components/StockChart';
import { AUTO_REFRESH_INTERVAL_MS } from '../../../lib/constants';

jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'mock-echarts' }),
}));

const chartResponse = {
  tickerId: 'NASDAQ:NVDA',
  symbol: 'NVDA',
  timeframe: '60',
  data: [
    {
      time: 1700000000000,
      open: 100,
      high: 110,
      low: 95,
      close: 105,
      volume: 1000,
    },
  ],
};

describe('StockChart auto refresh', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => chartResponse,
    } as Response);
    global.fetch = fetchMock;
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('autoRefresh=true のとき定期的にチャートを再取得する', async () => {
    render(
      React.createElement(StockChart, {
        tickerId: 'NASDAQ:NVDA',
        timeframe: '60',
        autoRefresh: true,
      })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      jest.advanceTimersByTime(AUTO_REFRESH_INTERVAL_MS);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('autoRefresh=false のとき初回取得のみ実行する', async () => {
    render(
      React.createElement(StockChart, {
        tickerId: 'NASDAQ:NVDA',
        timeframe: '60',
        autoRefresh: false,
      })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      jest.advanceTimersByTime(AUTO_REFRESH_INTERVAL_MS * 3);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('アンマウント時にタイマーをクリアする', async () => {
    const { unmount } = render(
      React.createElement(StockChart, {
        tickerId: 'NASDAQ:NVDA',
        timeframe: '60',
        autoRefresh: true,
      })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();

    act(() => {
      jest.advanceTimersByTime(AUTO_REFRESH_INTERVAL_MS * 2);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ティッカー未選択では自動更新を開始しない', async () => {
    render(React.createElement(StockChart, { tickerId: '', timeframe: '60', autoRefresh: true }));

    act(() => {
      jest.advanceTimersByTime(AUTO_REFRESH_INTERVAL_MS * 2);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
