/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TickerSummaryCard from '../../../components/TickerSummaryCard';
import HoldingCard from '../../../components/HoldingCard';
import TickerAlertListCard from '../../../components/TickerAlertListCard';
import type { TickerSummary } from '../../../types/stock';
import type { AlertResponse } from '../../../types/alert';

jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'StockChartMock'),
}));

jest.mock('../../../components/AlertSettingsModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('チャート画面カードコンポーネント', () => {
  const baseSummary: TickerSummary = {
    tickerId: 'NASDAQ:NVDA',
    date: '2025-09-25',
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
    holding: null,
    forecast: {
      dir: { probability: 0.56, baseline: 0.5, lean: 'UP' },
      vol: { probability: 0.4, baseline: 0.5, lean: 'NEUTRAL' },
      lit: { total: 3, buy: 2, sell: 1 },
    },
  };

  const renderCard = (summary: TickerSummary) =>
    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

  beforeEach(() => {
    // 詳細ダイアログを開くと確度を取得しにいくため、404 を返して「確度なし」の経路に倒す
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 }) as Response);
  });

  it('TickerSummaryCard: 基準日・方向・荒れ・点灯を表示する', () => {
    renderCard(baseSummary);

    expect(screen.getByText('サマリー')).toBeTruthy();
    expect(screen.getByTestId('summary-reference-date').textContent).toBe('9/25 引け時点');
    expect(screen.getByTestId('summary-dir-label').textContent).toBe('強含み 56%');
    expect(screen.getByTestId('summary-vol-label').textContent).toBe('平常');
    expect(screen.getByTestId('summary-lit').textContent).toBe('点灯: 3（買2売1）');
    expect(screen.getAllByText('基準 50%')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '詳細' })).toBeTruthy();
  });

  it('TickerSummaryCard: AI 由来の表示を含まない', () => {
    renderCard(baseSummary);

    expect(screen.queryByText('投資判断:')).toBeNull();
    expect(screen.queryByText('予測リターン:')).toBeNull();
    expect(screen.queryByText('確信度:')).toBeNull();
    expect(screen.queryByText('サポートレベル')).toBeNull();
    expect(screen.queryByText('レジスタンスレベル')).toBeNull();
  });

  it('TickerSummaryCard: 確度がないときは「—」を表示する', () => {
    renderCard({ ...baseSummary, forecast: null });

    expect(screen.getByTestId('summary-dir-label').textContent).toBe('—');
    expect(screen.getByTestId('summary-vol-label').textContent).toBe('—');
    expect(screen.getByTestId('summary-lit').textContent).toBe('点灯: —');
  });

  it('TickerSummaryCard: 荒れだけ確度がないときは荒れのみ「—」を表示する', () => {
    renderCard({
      ...baseSummary,
      forecast: { ...baseSummary.forecast!, vol: null },
    });

    expect(screen.getByTestId('summary-dir-label').textContent).toBe('強含み 56%');
    expect(screen.getByTestId('summary-vol-label').textContent).toBe('—');
  });

  it('TickerSummaryCard: 詳細ボタンで詳細ダイアログを開ける', async () => {
    renderCard(baseSummary);

    fireEvent.click(screen.getByRole('button', { name: '詳細' }));

    expect(screen.getByText('StockChartMock')).toBeTruthy();
    expect(await screen.findByTestId('forecast-unavailable-reason')).toBeTruthy();
    expect(screen.queryByText('AI 解析')).toBeNull();
  });

  it('HoldingCard: 保有なしを表示する', () => {
    render(
      React.createElement(HoldingCard, {
        holding: null,
        tickerId: 'NASDAQ:NVDA',
        symbol: 'NVDA',
        exchangeId: 'NASDAQ',
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.getByText('保有なし')).toBeTruthy();
    expect(screen.getByRole('button', { name: '追加' })).toBeTruthy();
  });

  it('TickerAlertListCard: アラート一覧を表示する', () => {
    const alerts: AlertResponse[] = [
      {
        alertId: 'alert-1',
        tickerId: 'NASDAQ:NVDA',
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

    render(
      React.createElement(TickerAlertListCard, {
        alerts,
        tickerId: 'NASDAQ:NVDA',
        symbol: 'NVDA',
        exchangeId: 'NASDAQ',
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.getByText('アラート')).toBeTruthy();
    expect(screen.getByText('以上 120')).toBeTruthy();
    expect(screen.getByText('有効')).toBeTruthy();
    expect(screen.getByRole('button', { name: '買い追加' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '売り追加' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '編集' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '削除' }).length).toBeGreaterThan(0);
  });
});
