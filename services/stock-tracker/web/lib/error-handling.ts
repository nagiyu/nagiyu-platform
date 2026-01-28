/**
 * エラーハンドリング関連のエクスポート
 *
 * エラーハンドリングに必要なコンポーネント、フック、ユーティリティを一元管理
 */

// コンポーネント
export { ErrorBoundary, useErrorHandler } from '../components/ErrorBoundary';
export { SnackbarProvider, useSnackbar } from '../components/SnackbarProvider';
export { ErrorDisplay, LoadingError } from '../components/ErrorDisplay';

// API Client（共通ライブラリから再エクスポート）
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

// Error Handler（共通ライブラリから再エクスポート）
export {
  COMMON_ERROR_MESSAGES,
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

// カスタムフック（共通ライブラリから再エクスポート）
export {
  useAPIRequest,
  type UseAPIRequestOptions,
  type UseAPIRequestReturn,
} from '@nagiyu/react';
