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

import { useState, useCallback, useRef, useEffect } from 'react';
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

  // コールバックを ref に保存して、常に最新の参照を使用
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  // コンポーネントがマウントされているかを追跡
  const isMountedRef = useRef(true);

  // リクエストIDを追跡して、最新のリクエストのみを処理
  const requestIdRef = useRef(0);

  // コールバックの参照を更新
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  // コンポーネントのマウント状態を追跡
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * APIリクエストを実行
   */
  const execute = useCallback(
    async (url: string, requestOptions?: APIRequestOptions): Promise<T | null> => {
      // 新しいリクエストIDを生成
      const currentRequestId = ++requestIdRef.current;

      setState((prev) => ({ ...prev, loading: true, error: null }));
      setLastRequest({ url, options: requestOptions });

      try {
        const data = await apiRequest<T>(url, requestOptions);

        // コンポーネントがアンマウントされている、または新しいリクエストが開始された場合は状態を更新しない
        if (!isMountedRef.current || currentRequestId !== requestIdRef.current) {
          return null;
        }

        setState({ data, loading: false, error: null });

        // 成功時コールバックを実行
        if (onSuccessRef.current) {
          onSuccessRef.current(data);
        }

        return data;
      } catch (error) {
        const apiError = error as APIError;

        // コンポーネントがアンマウントされている、または新しいリクエストが開始された場合は状態を更新しない
        if (!isMountedRef.current || currentRequestId !== requestIdRef.current) {
          return null;
        }

        setState({ data: null, loading: false, error: apiError });

        // エラー時コールバックを実行
        if (onErrorRef.current) {
          onErrorRef.current(apiError);
        }

        return null;
      }
    },
    [] // 依存配列を空にして、refを使用することで常に最新の値にアクセス
  );

  /**
   * 状態をリセット
   *
   * Note: reset() を実行すると lastRequest もクリアされるため、
   * その後 retry() を呼んでも何も実行されません。
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
