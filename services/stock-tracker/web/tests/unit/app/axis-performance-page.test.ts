/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import AxisPerformancePage from '../../../app/axis-performance/page';
import { EMPTY_MESSAGE } from '../../../lib/axis-performance-view/constants';

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }));
jest.mock('next/navigation', () => ({ useSearchParams: jest.fn() }));
jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'mock-echarts' }),
}));

const mockedSession = useSession as jest.MockedFunction<typeof useSession>;
const mockedParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;

const asViewer = () =>
  mockedSession.mockReturnValue({
    data: { user: { name: 'u', roles: ['stock-viewer'] }, expires: '2099-01-01' },
    status: 'authenticated',
    update: jest.fn(),
  } as never);

const RESPONSE = {
  question: 'DIR',
  period: '90d',
  market: 'ALL',
  from: '2026-06-30',
  to: '2026-09-24',
  evaluatedCount: 8120,
  hitRate: 0.503,
  neutralBand: { lower: 0, upper: 0.05 },
  calibration: [{ lower: 0.5, upper: 0.55, count: 100, meanProbability: 0.52, hitRate: 0.5 }],
  axes: [
    {
      axisId: 'a',
      name: '軸A',
      kind: 'FLAG',
      count: 100,
      hitRate: 0.55,
      diffFromBaseline: 0.05,
      meanExcessReturn: 0,
      currentWeight: 0.3,
      lowSample: false,
    },
  ],
};

const fetchMock = jest.fn();
const lastUrl = () => String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => RESPONSE });
  global.fetch = fetchMock as unknown as typeof fetch;
  mockedParams.mockReturnValue(new URLSearchParams() as never);
  asViewer();
});

describe('AxisPerformancePage', () => {
  it('セッション確認中は読み込み表示', () => {
    mockedSession.mockReturnValue({ data: null, status: 'loading', update: jest.fn() } as never);
    render(React.createElement(AxisPerformancePage));
    expect(screen.getByText('セッション情報を確認中...')).toBeTruthy();
  });

  it('stocks:read が無ければ権限エラーで、API を呼ばない', () => {
    mockedSession.mockReturnValue({
      data: { user: { name: 'u', roles: ['user-manager'] }, expires: '2099-01-01' },
      status: 'authenticated',
      update: jest.fn(),
    } as never);
    render(React.createElement(AxisPerformancePage));
    expect(screen.getByText('判断軸の成績を表示する権限がありません。')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('見出し行と各セクションを表示する', async () => {
    render(React.createElement(AxisPerformancePage));
    await waitFor(() =>
      expect(screen.getByTestId('axis-performance-headline').textContent).toBe(
        '採点済み 8,120 件 ／ 基準 50.3%'
      )
    );
    expect(lastUrl()).toBe('/api/axis-performance?question=DIR&period=90d&market=ALL');
    expect(screen.getByTestId('axis-performance-range').textContent).toContain('2026-06-30');
    expect(screen.getByTestId('calibration-section')).toBeTruthy();
    expect(screen.getByTestId('axis-table-section')).toBeTruthy();
  });

  it('question クエリで初期タブを選べる。市場の荒れは JP から始める', async () => {
    mockedParams.mockReturnValue(new URLSearchParams('question=MKT') as never);
    render(React.createElement(AxisPerformancePage));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastUrl()).toBe('/api/axis-performance?question=MKT&period=90d&market=JP');
    expect(screen.queryByRole('button', { name: '全体' })).toBeNull();
  });

  it('タブ・期間・市場の切替で再取得し、市場の荒れタブへ切り替えると ALL を JP に寄せる', async () => {
    render(React.createElement(AxisPerformancePage));
    await waitFor(() => expect(screen.getByTestId('calibration-section')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '30 日' }));
    await waitFor(() => expect(lastUrl()).toContain('period=30d'));

    fireEvent.click(await screen.findByRole('button', { name: 'US' }));
    await waitFor(() => expect(lastUrl()).toContain('market=US'));

    fireEvent.click(await screen.findByRole('button', { name: '全体' }));
    await waitFor(() => expect(lastUrl()).toContain('market=ALL'));

    fireEvent.click(await screen.findByRole('tab', { name: '市場の荒れ' }));
    await waitFor(() => expect(lastUrl()).toContain('question=MKT&period=30d&market=JP'));
  });

  it('採点済みが 0 件なら空状態を出す', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...RESPONSE,
        evaluatedCount: 0,
        from: null,
        to: null,
        axes: [],
        calibration: [],
      }),
    });
    render(React.createElement(AxisPerformancePage));
    await waitFor(() =>
      expect(screen.getByTestId('axis-performance-empty').textContent).toBe(EMPTY_MESSAGE)
    );
    expect(screen.queryByTestId('axis-performance-range')).toBeNull();
  });

  it('取得に失敗したらエラーを出す', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    render(React.createElement(AxisPerformancePage));
    await waitFor(() => expect(screen.getByText(/サーバーエラーが発生しました/)).toBeTruthy());
  });
});
