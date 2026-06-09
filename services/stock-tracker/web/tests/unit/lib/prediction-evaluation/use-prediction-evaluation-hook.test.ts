/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';

import { usePredictionEvaluationSummary } from '../../../../lib/prediction-evaluation/use-prediction-evaluation';
import type { SummaryResponse } from '../../../../lib/prediction-evaluation/types';

jest.mock('next/navigation', () => ({
  __esModule: true,
  useSearchParams: () => new URLSearchParams(),
}));

const MOCK_SUMMARY: SummaryResponse = {
  period: '7d',
  evaluatedAt: 1_000_000,
  threshold: 0.5,
  kpi: { totalAccuracy: 65.0, directionalAccuracy: 63.0, judgedCount: 40 },
  dailyTrend: [{ date: '2026-05-10', directionalAccuracy: 63.0, judgedCount: 10 }],
  bySignal: [
    { signal: 'BULLISH', accuracy: 70.0, count: 20 },
    { signal: 'NEUTRAL', accuracy: 50.0, count: 10 },
    { signal: 'BEARISH', accuracy: 60.0, count: 10 },
  ],
};

function mockFetch(status: number, body?: unknown) {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValueOnce(body ?? MOCK_SUMMARY),
  } as unknown as Response);
}

describe('usePredictionEvaluationSummary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('初期状態は loading=true', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePredictionEvaluationSummary('7d'));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('threshold を省略した場合、クエリに threshold=0.5 が含まれる', async () => {
    mockFetch(200);
    renderHook(() => usePredictionEvaluationSummary('7d'));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('threshold=0.5'),
        expect.any(Object)
      )
    );
  });

  it('threshold を指定した場合、クエリに指定値が含まれる', async () => {
    mockFetch(200);
    renderHook(() => usePredictionEvaluationSummary('7d', 1.0));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('threshold=1'),
        expect.any(Object)
      )
    );
  });

  it('threshold 変更時に新しい URL でリクエストを送る', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({ ...MOCK_SUMMARY, threshold: 0.5 }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({ ...MOCK_SUMMARY, threshold: 1.0 }),
      } as unknown as Response);

    const { result, rerender } = renderHook(
      ({ threshold }) => usePredictionEvaluationSummary('7d', threshold),
      { initialProps: { threshold: 0.5 } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ threshold: 1.0 });
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('200 レスポンスで data が返り loading=false になる', async () => {
    mockFetch(200, { ...MOCK_SUMMARY, period: '7d' });
    const { result } = renderHook(() => usePredictionEvaluationSummary('7d'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.period).toBe('7d');
    expect(result.current.error).toBeNull();
  });

  it('401 レスポンスで権限エラーメッセージになる', async () => {
    mockFetch(401);
    const { result } = renderHook(() => usePredictionEvaluationSummary('7d'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain('権限');
  });

  it('400 レスポンスでバリデーションエラーメッセージになる', async () => {
    mockFetch(400);
    const { result } = renderHook(() => usePredictionEvaluationSummary('7d'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain('不正');
  });

  it('500 レスポンスでサーバーエラーメッセージになる', async () => {
    mockFetch(500);
    const { result } = renderHook(() => usePredictionEvaluationSummary('7d'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain('サーバーエラー');
  });

  it('ネットワークエラーで汎用エラーメッセージになる', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => usePredictionEvaluationSummary('7d'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain('失敗しました');
  });

  it('period 切替時に新しい URL でリクエストを送り data が更新される', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({ ...MOCK_SUMMARY, period: '7d' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValueOnce({ ...MOCK_SUMMARY, period: '30d' }),
      } as unknown as Response);

    const { result, rerender } = renderHook(
      ({ period }) => usePredictionEvaluationSummary(period),
      { initialProps: { period: '7d' as const } }
    );

    await waitFor(() => expect(result.current.data?.period).toBe('7d'));

    rerender({ period: '30d' as const });
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data?.period).toBe('30d'));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('period=30d'),
      expect.any(Object)
    );
  });
});
