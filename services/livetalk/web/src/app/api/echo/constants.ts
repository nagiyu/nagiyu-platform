/**
 * /api/echo で利用する定数。
 * Next.js の Route Handler ファイル（`route.ts`）からは Route export しか許可されていないため、
 * メッセージや上限値は別ファイルに切り出している。
 */
export const ECHO_ERROR_MESSAGES = {
  INVALID_REQUEST: 'リクエスト形式が不正です',
  EMPTY_TEXT: 'メッセージを入力してください',
  TEXT_TOO_LONG: 'メッセージが長すぎます（200 文字以内で入力してください）',
  SYNTHESIS_FAILED: '音声合成に失敗しました',
  PERSISTENCE_FAILED: 'メッセージの保存に失敗しました',
} as const;

export const ECHO_MAX_TEXT_LENGTH = 200;
