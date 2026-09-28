/** @jest-environment jsdom */
/**
 * SummaryDetailDialog Unit Tests
 *
 * 開いたときの確度取得と、確度カード・内訳・折りたたみ・成績画面リンク・確度なしの表示を検証する。
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SummaryDetailDialog from '../../../components/SummaryDetailDialog';
import type { TickerSummary } from '../../../types/stock';
import type { ForecastDetailResponse, QuestionDetail } from '../../../types/forecast';

jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'StockChartMock'),
}));

jest.mock('../../../components/AlertSettingsModal', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? React.createElement('div', null, 'AlertSettingsModalMock') : null,
}));

const summary: TickerSummary = {
  tickerId: 'NASDAQ:NVDA',
  date: '2025-09-25',
  symbol: 'NVDA',
  name: 'NVIDIA',
  open: 100,
  high: 120,
  low: 90,
  close: 110,
  volume: 1234,
  updatedAt: '2026-01-01T00:00:00.000Z',
  buyPatternCount: 1,
  sellPatternCount: 0,
  buyAlertCount: { enabled: 0, disabled: 0 },
  sellAlertCount: { enabled: 0, disabled: 0 },
  holding: { quantity: 3, averagePrice: 99 },
  forecast: null,
};

const dirDetail: QuestionDetail = {
  probability: 0.56,
  baseline: 0.5,
  lean: 'UP',
  neutralBand: { lower: 0.47, upper: 0.53 },
  bandHistory: { lower: 0.55, upper: 0.6, count: 212, hitRate: 0.57 },
  axes: [
    {
      axisId: 'morning-star',
      name: '三川明けの明星',
      kind: 'FLAG',
      lit: true,
      performance: { count: 120, hitRate: 0.58, diffFromBaseline: 0.08 },
      contribution: 0.021,
      lowSample: false,
    },
    {
      axisId: 'range-5d',
      name: '直近 5 日の値幅',
      kind: 'NUMERIC',
      ratio: 1.42,
      performance: { count: 10, hitRate: 0.5, diffFromBaseline: 0 },
      contribution: -0.008,
      lowSample: true,
    },
    {
      axisId: 'evening-star',
      name: '三川宵の明星',
      kind: 'FLAG',
      lit: false,
      performance: { count: 90, hitRate: 0.45, diffFromBaseline: -0.05 },
      contribution: 0,
      lowSample: false,
    },
  ],
};

const volDetail: QuestionDetail = {
  probability: 0.64,
  baseline: 0.5,
  lean: 'HIGH',
  neutralBand: { lower: 0.47, upper: 0.53 },
  bandHistory: { lower: 0.6, upper: 0.65, count: 12, hitRate: 0.6 },
  axes: [
    {
      axisId: 'gap',
      name: 'ギャップ',
      kind: 'FLAG',
      lit: true,
      performance: { count: 40, hitRate: 0.7, diffFromBaseline: 0.2 },
      contribution: 0.05,
      lowSample: false,
    },
  ],
};

const detailResponse = (vol: QuestionDetail | null = volDetail): ForecastDetailResponse => ({
  tickerId: 'NASDAQ:NVDA',
  date: '2025-09-25',
  questions: { DIR: dirDetail, VOL: vol },
});

const mockFetch = (response: { ok: boolean; status: number; body?: unknown } | Error) => {
  global.fetch = jest.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    } as Response;
  });
};

const renderDialog = () =>
  render(React.createElement(SummaryDetailDialog, { open: true, summary, onClose: jest.fn() }));

describe('SummaryDetailDialog', () => {
  it('開いたときに基準日つきで確度を取得する', async () => {
    mockFetch({ ok: true, status: 200, body: detailResponse() });
    renderDialog();

    await screen.findByTestId('forecast-label-DIR');
    expect(global.fetch).toHaveBeenCalledWith('/api/forecasts/NASDAQ%3ANVDA?date=2025-09-25');
    expect(screen.getByText(/9\/25 引け時点/)).toBeTruthy();
  });

  it('確度カードにラベル・基準値との差・同じ確率帯の過去実績を表示する', async () => {
    mockFetch({ ok: true, status: 200, body: detailResponse() });
    renderDialog();

    await screen.findByTestId('forecast-label-DIR');
    const dirCard = screen.getByTestId('forecast-card-DIR');
    expect(within(dirCard).getByText('強含み 56%')).toBeTruthy();
    expect(within(dirCard).getByText(/基準 50%/).textContent).toContain('+6pt');
    expect(within(dirCard).getByText('55〜60% の帯の実績: 的中 57%（212 件）')).toBeTruthy();
    expect(within(dirCard).queryByText('件数が少なく参考値')).toBeNull();

    const volCard = screen.getByTestId('forecast-card-VOL');
    expect(within(volCard).getByText('荒れそう 64%')).toBeTruthy();
    expect(within(volCard).getByText('件数が少なく参考値')).toBeTruthy();
  });

  it('方向の内訳に値・寄与・件数不足を表示し、点灯しなかった軸は閉じた折りたたみに入れる', async () => {
    mockFetch({ ok: true, status: 200, body: detailResponse() });
    renderDialog();

    await screen.findByTestId('breakdown-DIR-table');
    const table = screen.getByTestId('breakdown-DIR-table');
    const flagRow = within(table).getByTestId('breakdown-DIR-row-morning-star');
    expect(within(flagRow).getByText('点灯')).toBeTruthy();
    expect(within(flagRow).getByText('+2.1pt')).toBeTruthy();

    const numericRow = within(table).getByTestId('breakdown-DIR-row-range-5d');
    expect(within(numericRow).getByText('1.4 倍（平常比）')).toBeTruthy();
    expect(within(numericRow).getByText(/−0\.8pt/)).toBeTruthy();
    expect(within(numericRow).getByText('件数不足')).toBeTruthy();

    const fold = screen.getByTestId('breakdown-DIR-inactive') as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(within(fold).getByText('三川宵の明星')).toBeTruthy();
    expect(within(table).queryByText('三川宵の明星')).toBeNull();
  });

  it('内訳タブで荒れに切り替えると成績画面リンクの問いも切り替わる', async () => {
    mockFetch({ ok: true, status: 200, body: detailResponse() });
    renderDialog();

    await screen.findByTestId('breakdown-DIR-table');
    expect(screen.getByTestId('axis-performance-link').getAttribute('href')).toBe(
      '/axis-performance?question=DIR'
    );

    fireEvent.click(screen.getByRole('tab', { name: '荒れの内訳' }));

    expect(await screen.findByTestId('breakdown-VOL-table')).toBeTruthy();
    expect(screen.getByTestId('axis-performance-link').getAttribute('href')).toBe(
      '/axis-performance?question=VOL'
    );
  });

  it('荒れだけ確度がないときは荒れを「—」にし、荒れの内訳の代わりに理由を出す', async () => {
    mockFetch({ ok: true, status: 200, body: detailResponse(null) });
    renderDialog();

    await screen.findByTestId('forecast-label-DIR');
    expect(screen.getByTestId('forecast-label-VOL').textContent).toBe('—');

    fireEvent.click(screen.getByRole('tab', { name: '荒れの内訳' }));
    expect((await screen.findByTestId('breakdown-unavailable')).textContent).toBe(
      '履歴が足りず算出できません'
    );
  });

  it('404 のときは「—」と理由を表示し、チャートとアラート作成は使える', async () => {
    mockFetch({ ok: false, status: 404 });
    renderDialog();

    expect((await screen.findByTestId('forecast-unavailable-reason')).textContent).toBe(
      'この日の確度はありません'
    );
    expect(screen.getByTestId('forecast-label-DIR').textContent).toBe('—');
    expect(screen.getByTestId('forecast-label-VOL').textContent).toBe('—');
    expect(screen.queryByTestId('breakdown-DIR-table')).toBeNull();
    expect(screen.getByText('StockChartMock')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '買いアラート設定' }));
    expect(screen.getByText('AlertSettingsModalMock')).toBeTruthy();
    expect(screen.getByRole('button', { name: '売りアラート設定' })).toBeTruthy();
  });

  it('取得に失敗したときは算出できなかった旨を表示する', async () => {
    mockFetch(new Error('network'));
    renderDialog();

    expect((await screen.findByTestId('forecast-unavailable-reason')).textContent).toBe(
      '確度を算出できませんでした'
    );
  });

  it('AI 由来の表示とパターン一覧を含まない', async () => {
    mockFetch({ ok: true, status: 200, body: detailResponse() });
    renderDialog();

    await screen.findByTestId('forecast-label-DIR');
    expect(screen.queryByText('AI 解析')).toBeNull();
    expect(screen.queryByText('パターン分析')).toBeNull();
    expect(screen.queryByText('投資判断')).toBeNull();
    expect(screen.queryByText('サポートレベル')).toBeNull();
  });

  it('閉じているときは確度を取得しない', async () => {
    mockFetch({ ok: true, status: 200, body: detailResponse() });
    render(React.createElement(SummaryDetailDialog, { open: false, summary, onClose: jest.fn() }));

    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
  });

  it('モバイル向けの行展開で値と過去成績を表示する', async () => {
    mockFetch({ ok: true, status: 200, body: detailResponse() });
    renderDialog();

    await screen.findByTestId('breakdown-DIR-table');
    fireEvent.click(screen.getByRole('button', { name: '三川明けの明星の詳細を開く' }));

    expect(screen.getByText(/過去成績: 120 件 \/ 的中 58%/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '三川明けの明星の詳細を閉じる' }));
    expect(screen.queryByText(/過去成績: 120 件/)).toBeNull();
  });
});
