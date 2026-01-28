/**
 * useAPIRequest Hook
 *
 * APIリクエストを実行し、エラーハンドリングとリトライ機能を提供するカスタムフック
 *
 * ## 依存注入パターン
 * このフックはトースト通知などのUI依存を持たず、成功時・エラー時のコールバックを通じて
 * 呼び出し側が自由にUI処理を実装できます。
 *
 * @example
 * ```tsx
 * import { useAPIRequest } from '@nagiyu/react';
 * import { useSnackbar } from '../components/SnackbarProvider';
 *
 * function MyComponent() {
 *   const { showSuccess, showError } = useSnackbar();
 *
 *   const { data, loading, error, execute } = useAPIRequest<User>({
 *     onSuccess: (data) => showSuccess('ユーザー情報を取得しました'),
 *     onError: (error) => showError(error.message),
 *   });
 *
 *   const handleFetch = async () => {
 *     await execute('/api/user');
 *   };
 *
 *   return (
 *     // ...
 *   );
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import { apiRequest, APIError, type APIRequestOptions } from '@nagiyu/common';

/**
 * useAPIRequest オプション
 */
export interface UseAPIRequestOptions<T> {
  /**
   * 成功時コールバック
   * リクエスト成功時に実行される
   */
  onSuccess?: (data: T) => void;

  /**
   * エラー時コールバック
   * リクエスト失敗時に実行される
   */
  onError?: (error: APIError) => void;
}

/**
 * useAPIRequest の戻り値
 */
export interface UseAPIRequestReturn<T> {
  /**
   * レスポンスデータ
   */
  data: T | null;

  /**
   * ローディング状態
   */
  loading: boolean;

  /**
   * エラー情報
   */
  error: APIError | null;

  /**
   * APIリクエストを実行
   */
  execute: (url: string, options?: APIRequestOptions) => Promise<T | null>;

  /**
   * 状態をリセット
   */
  reset: () => void;

  /**
   * 最後のリクエストを再試行
   */
  retry: () => Promise<T | null>;
}

/**
 * APIリクエストの状態
 */
interface APIRequestState<T> {
  data: T | null;
  loading: boolean;
  error: APIError | null;
}

/**
 * 最後のリクエスト情報
 */
interface LastRequest {
  url: string;
  options?: APIRequestOptions;
}

/**
 * useAPIRequest Hook
 *
 * APIリクエストを実行し、状態管理とエラーハンドリングを提供
 *
 * @template T - レスポンスデータの型
 * @param options - Hook のオプション
 * @returns APIリクエストの状態と操作関数
 */
export function useAPIRequest<T = unknown>(
  options: UseAPIRequestOptions<T> = {}
): UseAPIRequestReturn<T> {
  const { onSuccess, onError } = options;

  const [state, setState] = useState<APIRequestState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const [lastRequest, setLastRequest] = useState<LastRequest | null>(null);

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

        // 成功時コールバックを実行
        if (onSuccess) {
          onSuccess(data);
        }

        return data;
      } catch (error) {
        const apiError = error as APIError;
        setState({ data: null, loading: false, error: apiError });

        // エラー時コールバックを実行
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
