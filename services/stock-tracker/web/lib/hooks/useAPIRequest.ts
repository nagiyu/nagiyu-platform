'use client';

/**
 * useAPIRequest Hook
 *
 * APIリクエストを実行し、エラーハンドリングとリトライ機能を提供するカスタムフック
 */

import { useState, useCallback } from 'react';
import { APIError, apiRequest, type APIRequestOptions } from '../api-client';
import { useSnackbar } from '../../components/SnackbarProvider';

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
export interface UseAPIRequestOptions {
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
  successMessage?: string;
}

/**
 * useAPIRequest Hook
 *
 * APIリクエストを実行し、状態管理とエラーハンドリングを提供
 */
export function useAPIRequest<T = unknown>(
  options: UseAPIRequestOptions = {}
): UseAPIRequestReturn<T> {
  const {
    showErrorToast = true,
    showSuccessToast = false,
    successMessage = '操作が完了しました',
  } = options;

  const [state, setState] = useState<APIRequestState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const [lastRequest, setLastRequest] = useState<{
    url: string;
    options?: APIRequestOptions;
  } | null>(null);

  const { showError, showSuccess } = useSnackbar();

  /**
   * APIリクエストを実行
   */
  const execute = useCallback(
    async (url: string, requestOptions?: APIRequestOptions): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      setLastRequest({ url, options: requestOptions });

      try {
        const data = await apiRequest<T>(url, requestOptions);
        setState({ data, loading: false, error: null });

        // 成功トーストを表示
        if (showSuccessToast) {
          showSuccess(successMessage);
        }

        return data;
      } catch (error) {
        const apiError = error as APIError;
        setState({ data: null, loading: false, error: apiError });

        // エラートーストを表示
        if (showErrorToast) {
          showError(apiError.message);
        }

        return null;
      }
    },
    [showErrorToast, showSuccessToast, successMessage, showError, showSuccess]
  );

  /**
   * 状態をリセット
   */
  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
    setLastRequest(null);
  }, []);

  /**
   * 最後のリクエストをリトライ
   */
  const retry = useCallback(async (): Promise<T | null> => {
    if (!lastRequest) {
      console.warn('No previous request to retry');
      return null;
    }

    return execute(lastRequest.url, lastRequest.options);
  }, [lastRequest, execute]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    execute,
    reset,
    retry,
  };
}
