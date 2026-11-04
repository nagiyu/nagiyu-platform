/** @jest-environment jsdom */
/**
 * 保有株式画面の取引所 ID の扱いの Unit Tests
 *
 * 取引所 ID と API キーが異なる取引所で、ティッカー ID の先頭ではなくレスポンスの exchangeId を使うことを検証する。
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import HoldingsPage from '../../../app/holdings/page';

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
  default: ({ open, exchangeId }: { open: boolean; exchangeId: string }) =>
    open ? React.createElement('div', null, `AlertSettingsModalMock:${exchangeId}`) : null,
}));

const HOLDING = {
  holdingId: 'h-1',
  tickerId: 'OSE:6758',
  exchangeId: 'JPX-EX',
  symbol: '6758',
  name: 'ソニーグループ',
  quantity: 3,
  averagePrice: 3000,
  currency: 'JPY',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// 取引所 ID (JPX-EX) と API キー (OSE) が異なる取引所
const EXCHANGE = {
  exchangeId: 'JPX-EX',
  name: '大阪取引所',
  key: 'OSE',
  timezone: 'Asia/Tokyo',
  start: '09:00',
  end: '15:30',
  priceSource: 'tradingview',
};

const jsonResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  mockUseSession.mockReturnValue({
    data: { user: { name: 'u', roles: ['stock-user'] }, expires: '2099-01-01' },
    status: 'authenticated',
    update: jest.fn(),
  });
  global.fetch = jest.fn(async (url: string) => {
    if (url.startsWith('/api/holdings')) return jsonResponse({ holdings: [HOLDING] });
    if (url.startsWith('/api/alerts')) return jsonResponse({ alerts: [] });
    if (url.startsWith('/api/exchanges')) return jsonResponse({ exchanges: [EXCHANGE] });
    if (url.startsWith('/api/tickers')) return jsonResponse({ tickers: [] });
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

describe('保有株式画面の取引所 ID', () => {
  it('一覧の取引所名をレスポンスの exchangeId から引く', async () => {
    render(React.createElement(HoldingsPage));

    expect(await screen.findByText('6758')).toBeTruthy();
    expect(screen.getByText('大阪取引所')).toBeTruthy();
    expect(screen.queryByText('OSE')).toBeNull();
  });

  it('売りアラート設定にレスポンスの exchangeId を渡す', async () => {
    render(React.createElement(HoldingsPage));
    await screen.findByText('6758');

    fireEvent.click(screen.getByRole('button', { name: /売りアラート/ }));

    expect(screen.getByText('AlertSettingsModalMock:JPX-EX')).toBeTruthy();
  });

  it('編集ダイアログの取引所名をレスポンスの exchangeId から引く', async () => {
    render(React.createElement(HoldingsPage));
    await screen.findByText('6758');

    fireEvent.click(screen.getByRole('button', { name: /編集/ }));

    expect((screen.getByLabelText('取引所') as HTMLInputElement).value).toBe('大阪取引所');
  });
});
