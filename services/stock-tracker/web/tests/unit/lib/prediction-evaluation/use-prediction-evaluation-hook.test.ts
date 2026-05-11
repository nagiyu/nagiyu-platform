/** @jest-environment jsdom */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';

const searchParamsRef: { current: URLSearchParams } = { current: new URLSearchParams() };

jest.mock('next/navigation', () => ({
  __esModule: true,
  useSearchParams: () => searchParamsRef.current,
}));

import {
  usePredictionEvaluationSummary,
  usePredictionEvaluationTickers,
} from '../../../../lib/prediction-evaluation/use-prediction-evaluation';

describe('usePredictionEvaluationSummary', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    searchParamsRef.current = new URLSearchParams();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('初期状態は loading=true', () => {
    const { result } = renderHook(() => usePredictionEvaluationSummary('7d'));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('遅延後に data が返り loading=false になる', async () => {
    const { result } = renderHook(() => usePredictionEvaluationSummary('7d'));

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.period).toBe('7d');
    expect(result.current.error).toBeNull();
  });

  it('scenario=error の URL クエリでエラーになる', async () => {
    searchParamsRef.current = new URLSearchParams('scenario=error');
    const { result } = renderHook(() => usePredictionEvaluationSummary('30d'));

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain('失敗しました');
  });

  it('period 切替時に新しいデータを取得する', async () => {
    const { result, rerender } = renderHook(({ period }) => usePredictionEvaluationSummary(period), {
      initialProps: { period: '7d' as const },
    });

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await waitFor(() => expect(result.current.data?.period).toBe('7d'));

    rerender({ period: '30d' as const });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await waitFor(() => expect(result.current.data?.period).toBe('30d'));
  });
});

describe('usePredictionEvaluationTickers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    searchParamsRef.current = new URLSearchParams();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('minCount に応じて結果がフィルタされる', async () => {
    const { result } = renderHook(() => usePredictionEvaluationTickers('7d', 7));

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.minCount).toBe(7);
    result.current.data?.tickers.forEach((ticker) => {
      expect(ticker.count).toBeGreaterThanOrEqual(7);
    });
  });

  it('scenario=error でエラーを返す', async () => {
    searchParamsRef.current = new URLSearchParams('scenario=error');
    const { result } = renderHook(() => usePredictionEvaluationTickers('7d', 5));

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('銘柄別精度');
  });

  it('scenario=loading では loading=true のまま', () => {
    searchParamsRef.current = new URLSearchParams('scenario=loading');
    const { result } = renderHook(() => usePredictionEvaluationTickers('7d', 5));

    // resolve/reject されないため永続 loading
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
