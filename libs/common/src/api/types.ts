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

/**
 * 共通エラーメッセージ
 * const assertion で型安全性を確保
 */
export const COMMON_ERROR_MESSAGES = {
  // 認証エラー
  UNAUTHORIZED: 'ログインが必要です。再度ログインしてください',
  FORBIDDEN: 'この操作を実行する権限がありません',
  SESSION_EXPIRED: 'セッションが期限切れです。再度ログインしてください',

  // ネットワークエラー
  NETWORK_ERROR: 'ネットワーク接続を確認してください',
  TIMEOUT_ERROR: '接続がタイムアウトしました。しばらくしてから再度お試しください',
  SERVER_ERROR: 'サーバーエラーが発生しました。しばらくしてから再度お試しください',

  // リクエストエラー
  INVALID_REQUEST: '入力内容に誤りがあります。確認してください',
  VALIDATION_ERROR: '入力データが不正です',
  NOT_FOUND: 'データが見つかりませんでした',

  // データ操作エラー
  CREATE_ERROR: '登録に失敗しました',
  UPDATE_ERROR: '更新に失敗しました',
  DELETE_ERROR: '削除に失敗しました',
  FETCH_ERROR: 'データの取得に失敗しました',

  // デフォルト
  UNKNOWN_ERROR: '予期しないエラーが発生しました',
} as const;
