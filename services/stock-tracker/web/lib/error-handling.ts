/**
 * エラーハンドリング関連のエクスポート
 *
 * エラーハンドリングに必要なコンポーネント、フック、ユーティリティを一元管理
 */

// コンポーネント
export { ErrorBoundary, useErrorHandler } from '../components/ErrorBoundary';
export { SnackbarProvider, useSnackbar } from '../components/SnackbarProvider';
export { ErrorDisplay, LoadingError } from '../components/ErrorDisplay';

// API Client (from @nagiyu/common)
export {
  apiRequest,
  get,
  post,
  put,
  del,
  APIError,
  type APIRequestOptions,
  type RetryConfig,
} from '@nagiyu/common';

// Error Handler (from @nagiyu/common)
export {
  COMMON_ERROR_MESSAGES as ERROR_MESSAGES,
  handleFetchError,
  extractErrorInfo,
  mapAPIErrorToMessage,
  isRetryableError,
  getErrorTypeFromStatus,
  parseErrorResponse,
  type APIErrorResponse,
  type ErrorInfo,
  type ErrorType,
} from '@nagiyu/common';

// Stock Tracker固有のエラーメッセージ
export { STOCK_TRACKER_ERROR_MESSAGES } from './error-messages';

// カスタムフック (from @nagiyu/react)
export {
  useAPIRequest,
  type UseAPIRequestOptions,
  type UseAPIRequestReturn,
  type APIRequestState,
} from '@nagiyu/react';
