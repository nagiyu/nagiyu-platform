/**
 * 共通エラーメッセージ定数
 *
 * NOTE:
 * - ERROR_CODES.UNAUTHORIZED -> UNAUTHORIZED
 * - ERROR_CODES.FORBIDDEN -> FORBIDDEN
 * - ERROR_CODES.NOT_FOUND -> NOT_FOUND
 * - ERROR_CODES.VALIDATION_ERROR -> VALIDATION_ERROR
 * - ERROR_CODES.INTERNAL_ERROR（500系） -> INTERNAL_SERVER_ERROR
 */
export const COMMON_ERROR_MESSAGES = {
  UNAUTHORIZED: 'ログインが必要です。再度ログインしてください',
  FORBIDDEN: 'この操作を実行する権限がありません',
  SESSION_EXPIRED: 'セッションが期限切れです。再度ログインしてください',
  NETWORK_ERROR: 'ネットワーク接続を確認してください',
  TIMEOUT_ERROR: '接続がタイムアウトしました。しばらくしてから再度お試しください',
  SERVER_ERROR: 'サーバーエラーが発生しました。しばらくしてから再度お試しください',
  INVALID_REQUEST: '入力内容に誤りがあります。確認してください',
  NOT_FOUND: 'データが見つかりませんでした',
  VALIDATION_ERROR: '入力データが不正です',
  CREATE_ERROR: '登録に失敗しました',
  UPDATE_ERROR: '更新に失敗しました',
  DELETE_ERROR: '削除に失敗しました',
  FETCH_ERROR: 'データの取得に失敗しました',
  UNKNOWN_ERROR: '予期しないエラーが発生しました',
  INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました',
} as const;

export type CommonErrorMessageKey = keyof typeof COMMON_ERROR_MESSAGES;
