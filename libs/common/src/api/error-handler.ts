/**
 * エラーハンドリングユーティリティ
 *
 * APIエラーを統一的に処理し、ユーザーフレンドリーなメッセージに変換する
 */

import type { APIErrorResponse, ErrorInfo, ErrorType } from './types';
import { COMMON_ERROR_MESSAGES } from './types';

/**
 * HTTPステータスコードからエラータイプを判定
 */
export function getErrorTypeFromStatus(status: number): ErrorType {
  if (status >= 500) {
    return 'error';
  }
  if (status >= 400) {
    return 'warning';
  }
  return 'info';
}

/**
 * エラーレスポンスをパース
 */
export async function parseErrorResponse(response: Response): Promise<APIErrorResponse> {
  try {
    const data = await response.json();
    // Type guard to check if data has error and message properties
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      'message' in data &&
      typeof data.error === 'string' &&
      typeof data.message === 'string'
    ) {
      return data as APIErrorResponse;
    }
  } catch {
    // JSONパースエラーは無視
  }

  // レスポンスボディがない場合はステータスコードベースのメッセージを返す
  return {
    error: 'HTTP_ERROR',
    message: `HTTPエラー: ${response.status}`,
  };
}

/**
 * Fetch APIのエラーをユーザーフレンドリーなメッセージに変換
 */
export function handleFetchError(error: unknown): ErrorInfo {
  // ネットワークエラー (fetch が失敗した場合)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: 'error',
      message: COMMON_ERROR_MESSAGES.NETWORK_ERROR,
      shouldRetry: true,
    };
  }

  // タイムアウトエラー
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      type: 'error',
      message: COMMON_ERROR_MESSAGES.TIMEOUT_ERROR,
      shouldRetry: true,
    };
  }

  // その他のエラー
  return {
    type: 'error',
    message: COMMON_ERROR_MESSAGES.UNKNOWN_ERROR,
    shouldRetry: false,
  };
}

/**
 * APIエラーレスポンスをユーザーフレンドリーなメッセージに変換
 * 2段階マッピング: サービス固有メッセージ → 共通メッセージ → APIレスポンスメッセージ
 *
 * @param errorResponse APIエラーレスポンス
 * @param serviceMessages サービス固有のエラーメッセージマッピング（オプション）
 * @returns ユーザーフレンドリーなエラーメッセージ
 */
export function mapAPIErrorToMessage(
  errorResponse: APIErrorResponse,
  serviceMessages?: Record<string, string>
): string {
  const errorCode = errorResponse.error;

  // 第1優先: サービス固有メッセージ
  if (serviceMessages && errorCode in serviceMessages) {
    return serviceMessages[errorCode];
  }

  // 第2優先: 共通メッセージマッピング
  const commonMessageMap: Record<string, string> = {
    UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
    FORBIDDEN: COMMON_ERROR_MESSAGES.FORBIDDEN,
    INVALID_REQUEST: COMMON_ERROR_MESSAGES.INVALID_REQUEST,
    VALIDATION_ERROR: COMMON_ERROR_MESSAGES.VALIDATION_ERROR,
    NOT_FOUND: COMMON_ERROR_MESSAGES.NOT_FOUND,
    INTERNAL_ERROR: COMMON_ERROR_MESSAGES.SERVER_ERROR,
  };

  if (errorCode in commonMessageMap) {
    return commonMessageMap[errorCode];
  }

  // 第3優先: APIレスポンスのメッセージをそのまま使用
  return errorResponse.message || COMMON_ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * エラーがリトライ可能か判定
 */
export function isRetryableError(status: number): boolean {
  // ネットワークエラー、タイムアウト、サーバーエラーはリトライ可能
  if (status === 0 || status === 408 || status >= 500) {
    return true;
  }

  // 429 (Too Many Requests) もリトライ可能
  if (status === 429) {
    return true;
  }

  return false;
}

/**
 * Responseからエラー情報を抽出
 */
export async function extractErrorInfo(response: Response): Promise<ErrorInfo> {
  const errorResponse = await parseErrorResponse(response);
  const message = mapAPIErrorToMessage(errorResponse);
  const shouldRetry = isRetryableError(response.status);

  return {
    type: getErrorTypeFromStatus(response.status),
    message,
    details: errorResponse.details,
    shouldRetry,
  };
}
