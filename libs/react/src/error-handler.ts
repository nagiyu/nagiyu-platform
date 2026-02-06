/**
 * エラーハンドリングユーティリティ
 *
 * @nagiyu/common のエラーハンドリング機能を再エクスポート
 */

// エラーハンドリング関数を再エクスポート
export {
  getErrorTypeFromStatus,
  parseErrorResponse,
  handleFetchError,
  mapAPIErrorToMessage,
  isRetryableError,
  extractErrorInfo,
} from '@nagiyu/common';

// エラー関連の型を再エクスポート
export type { ErrorInfo, ErrorType, APIErrorResponse, ErrorResponse } from '@nagiyu/common';

// 共通エラーメッセージを再エクスポート
export { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
