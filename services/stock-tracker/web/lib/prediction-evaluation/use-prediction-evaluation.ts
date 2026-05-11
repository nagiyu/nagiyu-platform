'use client';

/**
 * 予測精度ダッシュボード PoC 用データ取得 hook
 *
 * 作業 1（UI PoC）の段階ではモック JSON を Promise でラップして返す。
 * 作業 7 でここの実装を `fetch('/api/prediction-evaluation/...')` に
 * 差し替えることで、UI 側のコード変更を最小に保つ「唯一の差し替え点」。
 *
 * URL クエリ `?scenario=error` でエラー応答、`?scenario=loading` でローディング
 * 永続を再現できる（PoC レビュー時に状態を試したいケース向け）。
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MOCK_SUMMARY_BY_PERIOD } from './mock-data';
import type { EvaluationPeriod, SummaryResponse } from './types';

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const MOCK_DELAY_MS = 300;

const ERROR_MESSAGES = {
  FETCH_SUMMARY: '予測精度サマリーの取得に失敗しました',
} as const;

type Scenario = 'normal' | 'loading' | 'error';

const resolveScenario = (raw: string | null): Scenario => {
  if (raw === 'loading' || raw === 'error') {
    return raw;
  }
  return 'normal';
};

const simulateFetch = <T>(payload: T, scenario: Scenario, errorMessage: string): Promise<T> => {
  if (scenario === 'loading') {
    return new Promise<T>(() => {
      /* never resolve */
    });
  }
  if (scenario === 'error') {
    return new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), MOCK_DELAY_MS);
    });
  }
  return new Promise<T>((resolve) => {
    setTimeout(() => resolve(payload), MOCK_DELAY_MS);
  });
};

export function usePredictionEvaluationSummary(
  period: EvaluationPeriod
): FetchState<SummaryResponse> {
  const searchParams = useSearchParams();
  const scenario = resolveScenario(searchParams?.get('scenario') ?? null);

  const [state, setState] = useState<FetchState<SummaryResponse>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    simulateFetch(MOCK_SUMMARY_BY_PERIOD[period], scenario, ERROR_MESSAGES.FETCH_SUMMARY)
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : ERROR_MESSAGES.FETCH_SUMMARY,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [period, scenario]);

  return state;
}
