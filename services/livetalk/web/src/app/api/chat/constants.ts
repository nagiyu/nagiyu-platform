/**
 * /api/chat で利用する定数。
 */
export const CHAT_ERROR_MESSAGES = {
  INVALID_REQUEST: 'リクエスト形式が不正です',
  EMPTY_TEXT: 'メッセージを入力してください',
  TEXT_TOO_LONG: 'メッセージが長すぎます（200 文字以内で入力してください）',
  INTERNAL_ERROR: '内部エラーが発生しました',
} as const;

export const CHAT_MAX_TEXT_LENGTH = 200;
