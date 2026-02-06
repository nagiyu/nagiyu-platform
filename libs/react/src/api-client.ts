/**
 * API Client クラス
 *
 * @nagiyu/common の関数型APIをクラスベースでラップし、
 * React アプリケーションでの利用を容易にする
 */

import {
  apiRequest,
  type APIRequestOptions,
  type RetryConfig,
  APIError,
  type ErrorInfo,
} from '@nagiyu/common';

/**
 * API Client クラス
 *
 * リトライ機能、タイムアウト、エラーマッピングを統合したHTTPクライアント
 *
 * @example
 * ```typescript
 * const client = new ApiClient('/api');
 *
 * // GET リクエスト
 * const user = await client.get<User>('/users/123');
 *
 * // POST リクエスト
 * const newUser = await client.post<User>('/users', { name: 'John' });
 *
 * // カスタムリトライ設定
 * const data = await client.get<Data>('/data', {
 *   retry: { maxRetries: 5, initialDelay: 2000 }
 * });
 * ```
 */
export class ApiClient {
  /**
   * API Client を作成
   *
   * @param baseUrl - ベースURL（デフォルト: ''）
   * @param defaultOptions - デフォルトのリクエストオプション
   */
  constructor(
    private readonly baseUrl: string = '',
    private readonly defaultOptions: APIRequestOptions = {}
  ) {}

  /**
   * APIリクエストを実行
   *
   * @template T - レスポンスデータの型
   * @param url - リクエストURL
   * @param options - リクエストオプション
   * @returns レスポンスデータ
   */
  async request<T = unknown>(url: string, options: APIRequestOptions = {}): Promise<T> {
    const fullUrl = this.baseUrl + url;
    const mergedOptions = {
      ...this.defaultOptions,
      ...options,
      headers: {
        ...this.defaultOptions.headers,
        ...options.headers,
      },
    };

    return apiRequest<T>(fullUrl, mergedOptions);
  }

  /**
   * GET リクエスト
   *
   * @template T - レスポンスデータの型
   * @param url - リクエストURL
   * @param options - リクエストオプション（method と body は除外）
   * @returns レスポンスデータ
   */
  async get<T = unknown>(
    url: string,
    options: Omit<APIRequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST リクエスト
   *
   * @template T - レスポンスデータの型
   * @param url - リクエストURL
   * @param body - リクエストボディ
   * @param options - リクエストオプション（method と body は除外）
   * @returns レスポンスデータ
   */
  async post<T = unknown>(
    url: string,
    body: unknown,
    options: Omit<APIRequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    return this.request<T>(url, {
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
   * PUT リクエスト
   *
   * @template T - レスポンスデータの型
   * @param url - リクエストURL
   * @param body - リクエストボディ
   * @param options - リクエストオプション（method と body は除外）
   * @returns レスポンスデータ
   */
  async put<T = unknown>(
    url: string,
    body: unknown,
    options: Omit<APIRequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    return this.request<T>(url, {
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
   * DELETE リクエスト
   *
   * @template T - レスポンスデータの型
   * @param url - リクエストURL
   * @param options - リクエストオプション（method と body は除外）
   * @returns レスポンスデータ
   */
  async delete<T = unknown>(
    url: string,
    options: Omit<APIRequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}

// 型とクラスを再エクスポート
export { APIError } from '@nagiyu/common';
export type { APIRequestOptions, RetryConfig, ErrorInfo } from '@nagiyu/common';
