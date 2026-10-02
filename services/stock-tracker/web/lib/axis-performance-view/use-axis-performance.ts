'use client';

import { useEffect, useState } from 'react';
import type {
  AxisPerformanceMarket,
  AxisPerformancePeriod,
  AxisPerformanceResponse,
  ForecastQuestion,
} from '../../types/forecast';
import { ERROR_MESSAGES } from './constants';

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function resolveErrorMessage(status: number): string {
  if (status === 401 || status === 403) return ERROR_MESSAGES.UNAUTHORIZED;
  if (status >= 400 && status < 500) return ERROR_MESSAGES.VALIDATION;
  if (status >= 500) return ERROR_MESSAGES.SERVER;
  return ERROR_MESSAGES.FETCH_FAILED;
}

export function useAxisPerformance(
  question: ForecastQuestion,
  period: AxisPerformancePeriod,
  market: AxisPerformanceMarket,
  enabled = true
): FetchState<AxisPerformanceResponse> {
  const [state, setState] = useState<FetchState<AxisPerformanceResponse>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // 権限が無いときに API を叩いて 403 を出さない
    if (!enabled) return;
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });

    fetch(`/api/axis-performance?question=${question}&period=${period}&market=${market}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          setState({ data: null, loading: false, error: resolveErrorMessage(res.status) });
          return;
        }
        const data = (await res.json()) as AxisPerformanceResponse;
        setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ data: null, loading: false, error: ERROR_MESSAGES.FETCH_FAILED });
      });

    return () => {
      controller.abort();
    };
  }, [question, period, market, enabled]);

  return state;
}
