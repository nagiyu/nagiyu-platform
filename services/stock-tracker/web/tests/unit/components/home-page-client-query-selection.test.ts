/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import HomePageClient from '../../../components/HomePageClient';
import type { StockChartProps } from '../../../components/StockChart';

let currentSearchParams = new URLSearchParams();
// jsdom では history.replaceState が useSearchParams に同期されないため、書き戻し先の URL だけを記録する。
// 実ブラウザでの同期は E2E で確かめる
const replaceMock = jest.fn();
let replaceStateSpy: jest.SpyInstance | null = null;

jest.mock('next/navigation', () => ({
  useSearchParams: () => currentSearchParams,
  usePathname: () => '/',
}));

// ティッカー一覧の応答を差し替える (保留・失敗の再現用)。null なら既定の応答を返す
let tickersOverride: (() => Promise<Response>) | null = null;

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
  ConfirmDialog: () => null,
  Button: ({
    children,
    onClick,
    disabled,
    type,
    asChild,
    loading,
    startIcon,
    ...rest
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    asChild?: boolean;
    loading?: boolean;
    startIcon?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    void asChild;
    void loading;
    void startIcon;
    return React.createElement(
      'button',
      { onClick, disabled, type: type ?? 'button', ...rest },
      children
    );
  },
  Chip: ({
    children,
    onClick,
    asChild,
    variant,
    color,
    size,
    ...rest
  }: {
    children?: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
    asChild?: boolean;
    variant?: string;
    color?: string;
    size?: string;
    [key: string]: unknown;
  }) => {
    void asChild;
    void variant;
    void color;
    void size;
    return React.createElement(
      onClick ? 'button' : 'span',
      { onClick, type: onClick ? 'button' : undefined, ...rest },
      children
    );
  },
  Select: ({
    id,
    label,
    value,
    onChange,
    options,
    disabled,
    placeholder,
    fullWidth,
    size,
    ...rest
  }: {
    id?: string;
    label?: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
    disabled?: boolean;
    placeholder?: string;
    fullWidth?: boolean;
    size?: string;
    [key: string]: unknown;
  }) => {
    void fullWidth;
    void size;
    return React.createElement(
      'select',
      {
        id,
        value,
        disabled,
        'aria-label': typeof label === 'string' ? label : undefined,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
        ...rest,
      },
      [
        placeholder !== undefined
          ? React.createElement('option', { key: '__placeholder', value: '' }, placeholder)
          : null,
        ...options.map((option) =>
          React.createElement(
            'option',
            { key: option.value, value: option.value, disabled: option.disabled },
            option.label
          )
        ),
      ]
    );
  },
}));

jest.mock('../../../components/EmptyState', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-testid': 'empty-state' }, title),
}));

describe('HomePageClient クエリ初期選択', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    replaceStateSpy = jest
      .spyOn(window.history, 'replaceState')
      .mockImplementation((_data, _unused, url) => {
        replaceMock(url);
      });
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
              {
                exchangeId: 'NYSE',
                name: 'NYSE',
                key: 'NYSE',
                timezone: 'America/New_York',
                tradingHours: { start: '09:30', end: '16:00' },
              },
            ],
          }),
        } as Response;
      }

      if (url === '/api/tickers?exchangeId=NYSE') {
        return {
          ok: true,
          json: async () => ({
            tickers: [{ tickerId: 'NYSE:IBM', symbol: 'IBM', name: 'IBM', exchangeId: 'NYSE' }],
          }),
        } as Response;
      }

      if (url === '/api/tickers?exchangeId=NASDAQ') {
        if (tickersOverride) {
          return tickersOverride();
        }
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
            date: '2025-09-25',
            forecast: null,
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
    replaceStateSpy?.mockRestore();
    cleanup();
    jest.clearAllMocks();
    currentSearchParams = new URLSearchParams();
    tickersOverride = null;
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

  describe('URL への書き戻し', () => {
    const selectValue = (container: HTMLElement, id: string, value: string) => {
      const element = container.querySelector(`#${id}`) as HTMLSelectElement;
      fireEvent.change(element, { target: { value } });
    };

    const getValue = (container: HTMLElement, id: string) =>
      (container.querySelector(`#${id}`) as HTMLSelectElement).value;

    it('取引所・銘柄・時間枠の選択が URL に書き戻される', async () => {
      const { container } = render(React.createElement(HomePageClient));
      await waitFor(() =>
        expect(container.querySelectorAll('#exchange-select option')).toHaveLength(3)
      );

      selectValue(container, 'exchange-select', 'NASDAQ');
      await waitFor(() => expect(replaceMock).toHaveBeenLastCalledWith('/?exchangeId=NASDAQ'));

      await waitFor(() =>
        expect((container.querySelector('#ticker-select') as HTMLSelectElement).disabled).toBe(
          false
        )
      );
      await waitFor(() =>
        expect(container.querySelectorAll('#ticker-select option')).toHaveLength(2)
      );
      selectValue(container, 'ticker-select', 'NASDAQ:AAPL');
      await waitFor(() =>
        expect(replaceMock).toHaveBeenLastCalledWith('/?exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL')
      );

      selectValue(container, 'timeframe-select', 'D');
      await waitFor(() =>
        expect(replaceMock).toHaveBeenLastCalledWith(
          '/?exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL&timeframe=D'
        )
      );

      // 既定値に戻すと時間枠は URL から消える
      selectValue(container, 'timeframe-select', '60');
      await waitFor(() =>
        expect(replaceMock).toHaveBeenLastCalledWith('/?exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL')
      );
    });

    it('取引所を変えると銘柄が URL から消える', async () => {
      currentSearchParams = new URLSearchParams('exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL');
      const { container } = render(React.createElement(HomePageClient));
      await waitFor(() => expect(getValue(container, 'ticker-select')).toBe('NASDAQ:AAPL'));

      selectValue(container, 'exchange-select', 'NYSE');

      await waitFor(() => expect(replaceMock).toHaveBeenLastCalledWith('/?exchangeId=NYSE'));
    });

    it('時間枠クエリが初期選択に反映され、有効なクエリは消されない', async () => {
      currentSearchParams = new URLSearchParams(
        'exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL&timeframe=D'
      );
      const { container } = render(React.createElement(HomePageClient));

      await waitFor(() => expect(getValue(container, 'ticker-select')).toBe('NASDAQ:AAPL'));
      expect(getValue(container, 'exchange-select')).toBe('NASDAQ');
      expect(getValue(container, 'timeframe-select')).toBe('D');
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('不正な時間枠クエリは既定値になり URL から取り除かれる', async () => {
      currentSearchParams = new URLSearchParams('timeframe=bogus');
      const { container } = render(React.createElement(HomePageClient));

      expect(getValue(container, 'timeframe-select')).toBe('60');
      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    });

    it('初回の反映が終わるまでクエリを消さない', async () => {
      currentSearchParams = new URLSearchParams(
        'exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL&timeframe=5'
      );
      let resolveTickers: (response: Response) => void = () => {};
      tickersOverride = () =>
        new Promise<Response>((resolve) => {
          resolveTickers = resolve;
        });

      const { container } = render(React.createElement(HomePageClient));

      // 取引所は反映されたが、ティッカー一覧が未取得の状態
      await waitFor(() => expect(getValue(container, 'exchange-select')).toBe('NASDAQ'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/tickers?exchangeId=NASDAQ'));
      expect(getValue(container, 'ticker-select')).toBe('');
      expect(replaceMock).not.toHaveBeenCalled();

      await act(async () => {
        resolveTickers({
          ok: true,
          json: async () => ({
            tickers: [
              { tickerId: 'NASDAQ:AAPL', symbol: 'AAPL', name: 'Apple', exchangeId: 'NASDAQ' },
            ],
          }),
        } as Response);
      });

      await waitFor(() => expect(getValue(container, 'ticker-select')).toBe('NASDAQ:AAPL'));
      // 反映後の選択はクエリと一致するので、書き戻しは発生しない
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('取引所一覧が未取得の間はクエリを消さない', async () => {
      currentSearchParams = new URLSearchParams('exchangeId=NASDAQ');
      let resolveExchanges: (response: Response) => void = () => {};
      const defaultImplementation = fetchMock.getMockImplementation();
      fetchMock.mockImplementation(async (input, init) => {
        if (String(input) === '/api/exchanges') {
          return new Promise<Response>((resolve) => {
            resolveExchanges = resolve;
          });
        }
        return defaultImplementation!(input, init);
      });

      const { container } = render(React.createElement(HomePageClient));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/exchanges'));
      expect(replaceMock).not.toHaveBeenCalled();

      await act(async () => {
        resolveExchanges({
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
        } as Response);
      });

      await waitFor(() => expect(getValue(container, 'exchange-select')).toBe('NASDAQ'));
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('クエリの銘柄が一覧に無いときは反映を諦め、銘柄だけ URL から消す', async () => {
      currentSearchParams = new URLSearchParams('exchangeId=NASDAQ&tickerId=NASDAQ%3AUNKNOWN');
      const { container } = render(React.createElement(HomePageClient));

      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/?exchangeId=NASDAQ'));
      expect(getValue(container, 'exchange-select')).toBe('NASDAQ');
      expect(getValue(container, 'ticker-select')).toBe('');
    });

    it('クエリが取引所だけのときは、取引所の反映後に書き戻しが有効になる', async () => {
      currentSearchParams = new URLSearchParams('exchangeId=NASDAQ');
      const { container } = render(React.createElement(HomePageClient));

      await waitFor(() => expect(getValue(container, 'exchange-select')).toBe('NASDAQ'));
      expect(replaceMock).not.toHaveBeenCalled();

      await waitFor(() =>
        expect(container.querySelectorAll('#ticker-select option')).toHaveLength(2)
      );
      selectValue(container, 'ticker-select', 'NASDAQ:AAPL');
      await waitFor(() =>
        expect(replaceMock).toHaveBeenLastCalledWith('/?exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL')
      );
    });

    it('取引所なしの銘柄クエリは反映できないので URL から消す', async () => {
      currentSearchParams = new URLSearchParams('tickerId=NASDAQ%3AAAPL');
      render(React.createElement(HomePageClient));

      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    });

    it('取引所一覧の取得に失敗したら反映を諦めてクエリを消す', async () => {
      currentSearchParams = new URLSearchParams('exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL');
      const defaultImplementation = fetchMock.getMockImplementation();
      fetchMock.mockImplementation(async (input, init) => {
        if (String(input) === '/api/exchanges') {
          return { ok: false, json: async () => ({}) } as Response;
        }
        return defaultImplementation!(input, init);
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(React.createElement(HomePageClient));

      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
      errorSpy.mockRestore();
    });

    it('ティッカー一覧の取得に失敗しても、その後の手動選択は URL に書き戻される', async () => {
      currentSearchParams = new URLSearchParams('exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL');
      tickersOverride = async () => ({ ok: false, json: async () => ({}) }) as Response;
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { container } = render(React.createElement(HomePageClient));

      await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/?exchangeId=NASDAQ'));

      selectValue(container, 'exchange-select', 'NYSE');
      await waitFor(() => expect(replaceMock).toHaveBeenLastCalledWith('/?exchangeId=NYSE'));
      errorSpy.mockRestore();
    });

    it('反映待ちの間に人が取引所を選んだら、その選択を優先する', async () => {
      currentSearchParams = new URLSearchParams('exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL');
      tickersOverride = () => new Promise<Response>(() => {});

      const { container } = render(React.createElement(HomePageClient));
      await waitFor(() => expect(getValue(container, 'exchange-select')).toBe('NASDAQ'));
      expect(replaceMock).not.toHaveBeenCalled();

      selectValue(container, 'exchange-select', 'NYSE');

      await waitFor(() => expect(replaceMock).toHaveBeenLastCalledWith('/?exchangeId=NYSE'));
    });
  });
});
