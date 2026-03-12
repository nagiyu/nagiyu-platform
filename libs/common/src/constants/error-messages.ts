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
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'アクセス権限がありません',
  NOT_FOUND: '対象のデータが見つかりません',
  VALIDATION_ERROR: '入力内容が不正です',
  INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました',
} as const;

export type CommonErrorMessageKey = keyof typeof COMMON_ERROR_MESSAGES;
