/** @jest-environment jsdom */
/**
 * ロールに応じた画面の出し分けの Unit Tests
 *
 * 権限の無い操作のボタンが出ないこと、管理画面が権限エラーになり一覧取得もしないことを検証する。
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import HoldingsPage from '../../../app/holdings/page';
import AlertsPage from '../../../app/alerts/page';
import ExchangesPage from '../../../app/exchanges/page';
import TickersPage from '../../../app/tickers/page';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('../../../components/AlertSettingsModal', () => ({
  __esModule: true,
  default: () => null,
}));

const sessionWithRoles = (roles: string[]) => ({
  data: { user: { name: 'u', roles }, expires: '2099-01-01' },
  status: 'authenticated',
  update: jest.fn(),
});
const LOADING_SESSION = { data: undefined, status: 'loading', update: jest.fn() };

const HOLDING = {
  holdingId: 'h-1',
  tickerId: 'NASDAQ:NVDA',
  symbol: 'NVDA',
  name: 'NVIDIA',
  quantity: 3,
  averagePrice: 99,
  currency: 'USD',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const ALERT = {
  alertId: 'a-1',
  tickerId: 'NASDAQ:NVDA',
  symbol: 'NVDA',
  name: 'NVIDIA',
  mode: 'Sell',
  frequency: 'MINUTE_LEVEL',
  conditions: [{ field: 'price', operator: 'gte', value: 120 }],
  enabled: true,
  temporary: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const EXCHANGE = {
  exchangeId: 'NASDAQ',
  name: 'NASDAQ',
  key: 'NASDAQ',
  timezone: 'America/New_York',
  start: '09:30',
  end: '16:00',
  priceSource: 'tradingview',
};

let fetchMock: jest.Mock;

const jsonResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  fetchMock = jest.fn(async (url: string) => {
    if (url.startsWith('/api/holdings')) return jsonResponse({ holdings: [HOLDING] });
    if (url.startsWith('/api/alerts')) return jsonResponse({ alerts: [ALERT] });
    if (url.startsWith('/api/exchanges')) return jsonResponse({ exchanges: [EXCHANGE] });
    if (url.startsWith('/api/tickers')) return jsonResponse({ tickers: [] });
    return jsonResponse({});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('保有株式管理画面', () => {
  it('stock-viewer には登録・アラート・編集・削除の操作を出さない', async () => {
    mockUseSession.mockReturnValue(sessionWithRoles(['stock-viewer']));
    render(React.createElement(HoldingsPage));

    expect(await screen.findByText('NVDA')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /新規登録/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /売りアラート|アラート設定済/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /編集/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /削除/ })).toBeNull();
  });

  it('stock-user には操作を出す', async () => {
    mockUseSession.mockReturnValue(sessionWithRoles(['stock-user']));
    render(React.createElement(HoldingsPage));

    expect(await screen.findByText('NVDA')).toBeTruthy();
    expect(screen.getByRole('button', { name: /新規登録/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /編集/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /削除/ })).toBeTruthy();
  });

  it('セッション読み込み中は操作を出さない', async () => {
    mockUseSession.mockReturnValue(LOADING_SESSION);
    render(React.createElement(HoldingsPage));

    expect(await screen.findByText('NVDA')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /新規登録/ })).toBeNull();
  });
});

describe('アラート一覧画面', () => {
  it('stock-viewer には編集・削除を出さない', async () => {
    mockUseSession.mockReturnValue(sessionWithRoles(['stock-viewer']));
    render(React.createElement(AlertsPage));

    expect(await screen.findByText('NVDA')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /編集/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /削除/ })).toBeNull();
    expect(screen.queryByText('操作')).toBeNull();
  });

  it('stock-user には編集・削除を出す', async () => {
    mockUseSession.mockReturnValue(sessionWithRoles(['stock-user']));
    render(React.createElement(AlertsPage));

    expect(await screen.findByText('NVDA')).toBeTruthy();
    expect(screen.getByRole('button', { name: /編集/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /削除/ })).toBeTruthy();
  });
});

describe.each([
  ['取引所管理画面', ExchangesPage, '取引所を管理する権限がありません。', '/api/exchanges'],
  ['ティッカー管理画面', TickersPage, 'ティッカーを管理する権限がありません。', '/api/tickers'],
])('%s', (_name, Page, message, apiPath) => {
  it.each([['stock-viewer'], ['stock-user']])(
    '%s には権限エラーを出し、一覧を取得しない',
    async (role) => {
      mockUseSession.mockReturnValue(sessionWithRoles([role]));
      render(React.createElement(Page));

      expect(screen.getByText('権限エラー')).toBeTruthy();
      expect(screen.getByText(message)).toBeTruthy();
      await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    }
  );

  it('セッション読み込み中は権限エラーを出さず、一覧も取得しない', () => {
    mockUseSession.mockReturnValue(LOADING_SESSION);
    render(React.createElement(Page));

    expect(screen.queryByText('権限エラー')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stock-admin には一覧を出して取得する', async () => {
    mockUseSession.mockReturnValue(sessionWithRoles(['stock-admin']));
    render(React.createElement(Page));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith(apiPath))).toBe(true)
    );
    expect(screen.queryByText('権限エラー')).toBeNull();
  });
});
