/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import TickerSummaryCard from '../../../components/TickerSummaryCard';
import HoldingCard from '../../../components/HoldingCard';
import TickerAlertListCard from '../../../components/TickerAlertListCard';
import type { TickerSummary } from '../../../types/stock';
import type { AlertResponse } from '../../../types/alert';

describe('チャート画面カードコンポーネント', () => {
  it('TickerSummaryCard: サマリー情報を表示する', () => {
    const summary: TickerSummary = {
      tickerId: 'NSDQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 2,
      sellPatternCount: 1,
      buyAlertCount: { enabled: 1, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
    };

    render(React.createElement(TickerSummaryCard, { summary, loading: false, error: '' }));

    expect(screen.getByText('サマリー')).toBeTruthy();
    expect(screen.getByText('始値: 100')).toBeTruthy();
    expect(screen.getByText('終値: 110')).toBeTruthy();
  });

  it('HoldingCard: 保有なしを表示する', () => {
    render(React.createElement(HoldingCard, { holding: null, loading: false, error: '' }));

    expect(screen.getByText('保有なし')).toBeTruthy();
  });

  it('TickerAlertListCard: アラート一覧を表示する', () => {
    const alerts: AlertResponse[] = [
      {
        alertId: 'alert-1',
        tickerId: 'NSDQ:NVDA',
        symbol: 'NVDA',
        name: 'NVIDIA',
        mode: 'Buy',
        frequency: 'MINUTE_LEVEL',
        conditions: [{ field: 'price', operator: 'gte', value: 120 }],
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(React.createElement(TickerAlertListCard, { alerts, loading: false, error: '' }));

    expect(screen.getByText('アラート')).toBeTruthy();
    expect(screen.getByText('gte 120')).toBeTruthy();
    expect(screen.getByText('有効')).toBeTruthy();
  });
});
