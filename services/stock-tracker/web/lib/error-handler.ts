/**
 * エラーハンドリングユーティリティ
 *
 * APIエラーを統一的に処理し、ユーザーフレンドリーなメッセージに変換する
 */

/**
 * エラーメッセージマッピング
 * 技術的なエラーコードをユーザーフレンドリーな日本語メッセージに変換
 */
export const ERROR_MESSAGES = {
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

/**
 * APIエラーレスポンス型
 */
export interface APIErrorResponse {
  error: string;
  message: string;
  details?: string[];
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
    if (data.error && data.message) {
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
      message: ERROR_MESSAGES.NETWORK_ERROR,
      shouldRetry: true,
    };
  }

  // タイムアウトエラー
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      type: 'error',
      message: ERROR_MESSAGES.TIMEOUT_ERROR,
      shouldRetry: true,
    };
  }

  // その他のエラー
  return {
    type: 'error',
    message: ERROR_MESSAGES.UNKNOWN_ERROR,
    shouldRetry: false,
  };
}

/**
 * APIエラーレスポンスをユーザーフレンドリーなメッセージに変換
 */
export function mapAPIErrorToMessage(errorResponse: APIErrorResponse): string {
  const errorCode = errorResponse.error;

  // エラーコードマッピング
  const messageMap: Record<string, string> = {
    UNAUTHORIZED: ERROR_MESSAGES.UNAUTHORIZED,
    FORBIDDEN: ERROR_MESSAGES.FORBIDDEN,
    INVALID_REQUEST: ERROR_MESSAGES.INVALID_REQUEST,
    VALIDATION_ERROR: ERROR_MESSAGES.VALIDATION_ERROR,
    NOT_FOUND: ERROR_MESSAGES.NOT_FOUND,
    INTERNAL_ERROR: ERROR_MESSAGES.SERVER_ERROR,
  };

  // マッピングされたメッセージがあればそれを使用、なければAPIレスポンスのメッセージをそのまま使用
  return messageMap[errorCode] || errorResponse.message || ERROR_MESSAGES.UNKNOWN_ERROR;
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
