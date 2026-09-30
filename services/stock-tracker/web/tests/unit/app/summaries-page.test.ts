/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import SummariesPage from '../../../app/summaries/page';
import type { SummariesResponse, TickerSummary } from '../../../types/stock';
import type { TickerForecastSummary } from '../../../types/forecast';

jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'StockChartMock'),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

const forecast = (dir: number | null, vol: number | null): TickerForecastSummary => ({
  dir:
    dir === null
      ? null
      : {
          probability: dir,
          baseline: 0.5,
          lean: dir > 0.53 ? 'UP' : dir < 0.47 ? 'DOWN' : 'NEUTRAL',
        },
  vol:
    vol === null
      ? null
      : { probability: vol, baseline: 0.5, lean: vol > 0.55 ? 'HIGH' : 'NEUTRAL' },
  lit: { total: 3, buy: 2, sell: 1 },
});

const ticker = (
  symbol: string,
  forecastSummary: TickerForecastSummary | null,
  overrides: Partial<TickerSummary> = {}
): TickerSummary => ({
  tickerId: `TEST:${symbol}`,
  date: '2025-09-25',
  symbol,
  name: `${symbol}株式会社`,
  open: 1,
  high: 2,
  low: 1,
  close: 2,
  updatedAt: '2026-03-02T00:00:00.000Z',
  buyPatternCount: 0,
  sellPatternCount: 0,
  buyAlertCount: { enabled: 1, disabled: 2 },
  sellAlertCount: { enabled: 0, disabled: 0 },
  holding: null,
  forecast: forecastSummary,
  ...overrides,
});

const response: SummariesResponse = {
  exchanges: [
    {
      exchangeId: 'test',
      exchangeName: 'テスト取引所',
      date: '2025-09-25',
      summaries: [
        ticker('AAA', forecast(0.5, 0.4)),
        ticker('BBB', forecast(0.62, 0.7)),
        ticker('CCC', null),
        ticker('DDD', forecast(0.35, 0.5), { holding: { quantity: 1, averagePrice: 1 } }),
      ],
    },
  ],
  marketForecasts: [
    {
      market: 'JP',
      date: '2025-09-25',
      forecast: { probability: 0.64, baseline: 0.5, lean: 'HIGH', lowSample: true },
    },
    { market: 'US', date: null, forecast: null },
  ],
};

const symbolsInOrder = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelectorAll('td')[0].textContent ?? '');

describe('SummariesPage', () => {
  beforeEach(() => {
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => response,
    })) as unknown as typeof fetch;
  });

  it('見出しと取引所セレクトを表示する', async () => {
    render(React.createElement(SummariesPage));

    expect(screen.getByText('日次サマリー')).toBeTruthy();
    expect(screen.getByText('読み込み中...')).toBeTruthy();
    await screen.findByRole('heading', { name: 'テスト取引所' });
  });

  it('市場の荒れ予報を 1 枚のカードにまとめ、共通の注記は 1 回だけ出す', async () => {
    render(React.createElement(SummariesPage));
    await screen.findByRole('heading', { name: 'テスト取引所' });

    expect(screen.getAllByTestId('market-forecast-card')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '市場の荒れ予報の説明' })).toHaveLength(1);

    const jp = screen.getByTestId('market-forecast-JP');
    expect(within(jp).getByTestId('market-forecast-label-JP').textContent).toBe('荒れそう');
    expect(within(jp).getByTestId('market-forecast-probability-JP').textContent).toBe(
      '荒れる確率 64%'
    );
    expect(within(jp).getByText('9/25 引け時点')).toBeTruthy();

    const us = screen.getByTestId('market-forecast-US');
    expect(within(us).getByTestId('market-forecast-label-US').textContent).toBe('—');
    expect(within(us).queryByTestId('market-forecast-probability-US')).toBeNull();

    expect(screen.getAllByTestId('market-forecast-usual')).toHaveLength(1);
    expect(screen.getByTestId('market-forecast-usual').textContent).toBe('ふだんの荒れる割合 50%');
    expect(screen.getAllByTestId('market-forecast-low-sample')).toHaveLength(1);
    expect(screen.getByTestId('market-forecast-low-sample').textContent).toBe(
      '過去の日数が少ないため参考値'
    );
  });

  it('一覧の列を確度用に置き換え、AI 由来の列を持たない', async () => {
    render(React.createElement(SummariesPage));
    await screen.findByRole('heading', { name: 'テスト取引所' });

    for (const name of [
      'シンボル',
      '銘柄名',
      '保有',
      '方向',
      '荒れ',
      '点灯',
      '買いアラート数',
      '売りアラート数',
    ]) {
      expect(screen.getByRole('columnheader', { name })).toBeTruthy();
    }
    for (const name of ['投資判断', '予測リターン', '確信度', '買いシグナル', '売りシグナル']) {
      expect(screen.queryByRole('columnheader', { name })).toBeNull();
    }
  });

  it('行に方向・荒れ・点灯・アラート数を表示する', async () => {
    render(React.createElement(SummariesPage));
    await screen.findByRole('heading', { name: 'テスト取引所' });

    expect(screen.getByTestId('dir-TEST:BBB').textContent).toBe('強含み62%');
    expect(screen.getByTestId('vol-TEST:BBB').textContent).toBe('荒れそう70%');
    expect(screen.getByTestId('dir-TEST:DDD').textContent).toBe('弱含み35%');
    expect(screen.getByTestId('dir-TEST:AAA').textContent).toBe('中立50%');
    expect(screen.getByTestId('vol-TEST:AAA').textContent).toBe('平常40%');
    expect(screen.getByTestId('lit-TEST:BBB').textContent).toBe('3（買2売1）');
    expect(screen.getByTestId('buy-alert-TEST:BBB').textContent).toBe('1 (2)');
    expect(screen.getByTestId('dir-TEST:CCC').textContent).toBe('—');
    expect(screen.getByTestId('lit-TEST:CCC').textContent).toBe('—');
  });

  it('方向の列見出しで 降順 → 昇順 → 既定順 に並べ替え、確度なしは常に末尾にする', async () => {
    render(React.createElement(SummariesPage));
    await screen.findByRole('heading', { name: 'テスト取引所' });
    expect(symbolsInOrder()).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);

    const dirSort = screen.getByTestId('sort-dir');
    fireEvent.click(dirSort);
    expect(symbolsInOrder()).toEqual(['BBB', 'AAA', 'DDD', 'CCC']);

    fireEvent.click(dirSort);
    expect(symbolsInOrder()).toEqual(['DDD', 'AAA', 'BBB', 'CCC']);

    fireEvent.click(dirSort);
    expect(symbolsInOrder()).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
  });

  it('荒れの列見出しは P(荒れる) で並べ替える', async () => {
    render(React.createElement(SummariesPage));
    await screen.findByRole('heading', { name: 'テスト取引所' });

    fireEvent.click(screen.getByTestId('sort-vol'));
    expect(symbolsInOrder()).toEqual(['BBB', 'DDD', 'AAA', 'CCC']);
  });

  it('行のクリックで詳細ダイアログを開く', async () => {
    render(React.createElement(SummariesPage));
    await screen.findByRole('heading', { name: 'テスト取引所' });

    fireEvent.click(screen.getByText('BBB'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith('/api/forecasts/TEST%3ABBB?date=2025-09-25');
  });

  it('取得に失敗したときはエラーメッセージを表示する', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: '取得エラー' }),
    })) as unknown as typeof fetch;
    render(React.createElement(SummariesPage));

    expect(await screen.findByText('取得エラー')).toBeTruthy();
  });
});
