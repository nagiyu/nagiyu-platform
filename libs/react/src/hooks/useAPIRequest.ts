'use client';

/**
 * useAPIRequest Hook
 *
 * APIリクエストを実行し、エラーハンドリングとリトライ機能を提供するカスタムフック
 */

import { useState, useCallback, useRef } from 'react';
import { APIError, apiRequest, type APIRequestOptions } from '@nagiyu/common';

/**
 * APIリクエストの状態
 */
export interface APIRequestState<T> {
  data: T | null;
  loading: boolean;
  error: APIError | null;
}

/**
 * useAPIRequest の戻り値
 */
export interface UseAPIRequestReturn<T> {
  data: T | null;
  loading: boolean;
  error: APIError | null;
  execute: (url: string, options?: APIRequestOptions) => Promise<T | null>;
  reset: () => void;
  retry: () => Promise<T | null>;
}

/**
 * useAPIRequest オプション
 */
export interface UseAPIRequestOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: APIError) => void;
}

/**
 * useAPIRequest Hook
 *
 * APIリクエストを実行し、状態管理とエラーハンドリングを提供
 */
export function useAPIRequest<T>(options: UseAPIRequestOptions<T> = {}): UseAPIRequestReturn<T> {
  const { onSuccess, onError } = options;

  const [state, setState] = useState<APIRequestState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const lastRequestRef = useRef<{
    url: string;
    options?: APIRequestOptions;
  } | null>(null);

  /**
   * APIリクエストを実行
   */
  const execute = useCallback(
    async (url: string, requestOptions?: APIRequestOptions): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      lastRequestRef.current = { url, options: requestOptions };

      try {
        const data = await apiRequest<T>(url, requestOptions);
        setState({ data, loading: false, error: null });

        // 成功コールバックを呼び出し
        if (onSuccess) {
          onSuccess(data);
        }

        return data;
      } catch (error) {
        const apiError = error as APIError;
        setState({ data: null, loading: false, error: apiError });

        // エラーコールバックを呼び出し
        if (onError) {
          onError(apiError);
        }

        return null;
      }
    },
    [onSuccess, onError]
  );

  /**
   * 状態をリセット
   */
  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
    lastRequestRef.current = null;
  }, []);

  /**
   * 最後のリクエストをリトライ
   */
  const retry = useCallback(async (): Promise<T | null> => {
    if (!lastRequestRef.current) {
      console.warn('No previous request to retry');
      return null;
    }

    return execute(lastRequestRef.current.url, lastRequestRef.current.options);
  }, [execute]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    execute,
    reset,
    retry,
  };
}
