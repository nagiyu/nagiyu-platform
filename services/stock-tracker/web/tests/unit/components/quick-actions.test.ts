/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import QuickActions from '../../../components/QuickActions';

describe('QuickActions', () => {
  it('hasManageDataPermission: true の場合、共通ボタンと管理者ボタンがすべて表示される', () => {
    render(React.createElement(QuickActions, { hasManageDataPermission: true }));

    const holdingsButton = screen.getByRole('link', { name: /保有株式管理/ });
    const alertsButton = screen.getByRole('link', { name: /アラート一覧/ });
    const summariesButton = screen.getByRole('link', { name: /サマリー/ });
    const exchangeButton = screen.getByRole('link', { name: /取引所管理/ });
    const tickerButton = screen.getByRole('link', { name: /ティッカー管理/ });

    expect(holdingsButton).toBeTruthy();
    expect(alertsButton).toBeTruthy();
    expect(summariesButton).toBeTruthy();
    expect(exchangeButton).toBeTruthy();
    expect(tickerButton).toBeTruthy();

    expect(holdingsButton.getAttribute('href')).toBe('/holdings');
    expect(alertsButton.getAttribute('href')).toBe('/alerts');
    expect(summariesButton.getAttribute('href')).toBe('/summaries');
    expect(exchangeButton.getAttribute('href')).toBe('/exchanges');
    expect(tickerButton.getAttribute('href')).toBe('/tickers');
  });

  it('hasManageDataPermission: false の場合、共通ボタンは表示されるが管理者ボタンは表示されない', () => {
    render(React.createElement(QuickActions, { hasManageDataPermission: false }));

    expect(screen.getByRole('link', { name: /保有株式管理/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /アラート一覧/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /サマリー/ })).toBeTruthy();

    expect(screen.queryByRole('link', { name: /取引所管理/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /ティッカー管理/ })).toBeNull();
  });
});
