/**
 * API クライアント
 *
 * リトライ機能とエラーハンドリングを統合したFetchラッパー
 */

import { handleFetchError, extractErrorInfo } from './error-handler';
import { APIError } from './types';
import type { RetryConfig, APIRequestOptions } from './types';

/**
 * デフォルトリトライ設定
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1秒
  maxDelay: 10000, // 10秒
  backoffMultiplier: 2,
};

/**
 * デフォルトタイムアウト設定
 */
const DEFAULT_TIMEOUT = 30000; // 30秒

/**
 * エクスポネンシャルバックオフの遅延時間を計算
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  );
  // ジッター追加（遅延時間の±25%のランダム値）
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

/**
 * 指定時間スリープ
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * タイムアウト付きfetch
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * リトライ機能付きAPIリクエスト
 *
 * @template T - レスポンスデータの型（明示的に指定する必要があります）
 * @param url - リクエストURL
 * @param options - リクエストオプション
 * @returns レスポンスデータ
 */
export async function apiRequest<T>(url: string, options: APIRequestOptions = {}): Promise<T> {
  const { retry, timeout, ...fetchOptions } = options;
  const retryConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...retry,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        ...fetchOptions,
        timeout,
      });

      // レスポンスが成功の場合
      if (response.ok) {
        // JSONレスポンスをパース
        const data = await response.json();
        return data as T;
      }

      // レスポンスエラーの場合
      const errorInfo = await extractErrorInfo(response);

      // リトライ可能なエラーで、まだリトライ回数が残っている場合
      if (errorInfo.shouldRetry && attempt < retryConfig.maxRetries) {
        const delay = calculateBackoffDelay(attempt, retryConfig);
        console.log(
          `Retrying request to ${url} after ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // リトライしない、または最終試行の場合はエラーをスロー
      throw new APIError(response.status, errorInfo, errorInfo.message);
    } catch (error) {
      // fetchレベルのエラー（ネットワークエラー、タイムアウトなど）
      if (error instanceof APIError) {
        throw error;
      }

      lastError = error as Error;
      const errorInfo = handleFetchError(error);

      // リトライ可能なエラーで、まだリトライ回数が残っている場合
      if (errorInfo.shouldRetry && attempt < retryConfig.maxRetries) {
        const delay = calculateBackoffDelay(attempt, retryConfig);
        console.log(
          `Retrying request to ${url} after ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // リトライしない、または最終試行の場合はエラーをスロー
      throw new APIError(0, errorInfo, errorInfo.message);
    }
  }

  // このコードは理論上到達しないが、TypeScriptの型安全性のために存在
  // すべてのリトライが完了した場合、ループ内でエラーがスローされる
  throw lastError || new Error('Request failed after all retries');
}

/**
 * GETリクエスト
 *
 * @template T - レスポンスデータの型（明示的に指定する必要があります）
 */
export async function get<T>(
  url: string,
  options: Omit<APIRequestOptions, 'method' | 'body'> = {}
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'GET',
  });
}

/**
 * POSTリクエスト
 *
 * @template T - レスポンスデータの型（明示的に指定する必要があります）
 */
export async function post<T>(
  url: string,
  body: unknown,
  options: Omit<APIRequestOptions, 'method' | 'body'> = {}
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * PUTリクエスト
 *
 * @template T - レスポンスデータの型（明示的に指定する必要があります）
 */
export async function put<T>(
  url: string,
  body: unknown,
  options: Omit<APIRequestOptions, 'method' | 'body'> = {}
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * DELETEリクエスト
 *
 * @template T - レスポンスデータの型（明示的に指定する必要があります）
 */
export async function del<T>(
  url: string,
  options: Omit<APIRequestOptions, 'method' | 'body'> = {}
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'DELETE',
  });
}
