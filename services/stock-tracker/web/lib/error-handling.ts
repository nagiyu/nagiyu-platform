/**
 * エラーハンドリング関連のエクスポート
 *
 * エラーハンドリングに必要なコンポーネント、フック、ユーティリティを一元管理
 */

// コンポーネント
export { ErrorBoundary, useErrorHandler } from '../components/ErrorBoundary';
export { SnackbarProvider, useSnackbar } from '../components/SnackbarProvider';
export { ErrorDisplay, LoadingError } from '../components/ErrorDisplay';

// API Client
export {
  apiRequest,
  get,
  post,
  put,
  del,
  APIError,
  type APIRequestOptions,
  type RetryConfig,
} from './api-client';

// Error Handler
export {
  ERROR_MESSAGES,
  handleFetchError,
  extractErrorInfo,
  mapAPIErrorToMessage,
  isRetryableError,
  getErrorTypeFromStatus,
  parseErrorResponse,
  type APIErrorResponse,
  type ErrorInfo,
  type ErrorType,
} from './error-handler';

// カスタムフック
export { useAPIRequest, type UseAPIRequestOptions, type UseAPIRequestReturn } from './hooks/useAPIRequest';
