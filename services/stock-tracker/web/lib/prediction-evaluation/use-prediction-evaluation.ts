'use client';

import { useEffect, useState } from 'react';
import type { EvaluationPeriod, SummaryResponse } from './types';

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const ERROR_MESSAGES = {
  UNAUTHORIZED: '予測精度ダッシュボードを表示する権限がありません。',
  VALIDATION: 'リクエストパラメータが不正です。',
  SERVER: 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。',
  FETCH_SUMMARY: '予測精度サマリーの取得に失敗しました。',
} as const;

function resolveErrorMessage(status: number): string {
  if (status === 401) return ERROR_MESSAGES.UNAUTHORIZED;
  if (status >= 400 && status < 500) return ERROR_MESSAGES.VALIDATION;
  if (status >= 500) return ERROR_MESSAGES.SERVER;
  return ERROR_MESSAGES.FETCH_SUMMARY;
}

export function usePredictionEvaluationSummary(
  period: EvaluationPeriod
): FetchState<SummaryResponse> {
  const [state, setState] = useState<FetchState<SummaryResponse>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });

    fetch(`/api/prediction-evaluation/summary?period=${period}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          setState({ data: null, loading: false, error: resolveErrorMessage(res.status) });
          return;
        }
        const data = (await res.json()) as SummaryResponse;
        setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ data: null, loading: false, error: ERROR_MESSAGES.FETCH_SUMMARY });
      });

    return () => {
      controller.abort();
    };
  }, [period]);

  return state;
}
