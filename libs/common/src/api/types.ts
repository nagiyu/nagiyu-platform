/**
 * API Common Types
 *
 * Framework-agnostic type definitions for API communication.
 */

/**
 * リトライ設定
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * APIリクエストオプション
 */
export interface APIRequestOptions extends RequestInit {
  retry?: Partial<RetryConfig>;
  timeout?: number;
}

/**
 * エラー種別
 */
export type ErrorType = 'error' | 'warning' | 'info';

/**
 * エラー情報
 */
export interface ErrorInfo {
  type: ErrorType;
  message: string;
  details?: string[];
  shouldRetry?: boolean;
}

/**
 * APIエラーレスポンス型
 */
export interface APIErrorResponse {
  error: string;
  message: string;
  details?: string[];
}

/**
 * APIエラーレスポンス型（標準化された型名）
 * @alias APIErrorResponse
 */
export type ErrorResponse = APIErrorResponse;

/**
 * ページネーション付きレスポンス型
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    count: number;
    lastKey?: string; // base64エンコード済みDynamoDB lastKey
  };
}

/**
 * 成功レスポンス型
 */
export interface ApiSuccessResponse<T> {
  data: T;
}

/**
 * APIレスポンス型（成功・失敗のユニオン）
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | APIErrorResponse;

/**
 * APIエラー
 */
export class APIError extends Error {
  public readonly status: number;
  public readonly errorInfo: ErrorInfo;

  constructor(status: number, errorInfo: ErrorInfo, message: string) {
    super(message);
    this.status = status;
    this.errorInfo = errorInfo;
    this.name = 'APIError';
  }
}
