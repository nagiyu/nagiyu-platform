/**
 * 記憶編集 API（`/api/memory`）のエラーメッセージ定数（日本語）。
 */
export const MEMORY_ERROR_MESSAGES = {
  INVALID_TIER: 'Tier の指定が不正です',
  INVALID_REQUEST: 'リクエスト形式が不正です',
  INVALID_ID: '記憶 ID が不正です',
  EMPTY_PATCH: 'content または category を指定してください',
  INVALID_CONTENT: 'content が不正です',
  CONTENT_TOO_LONG: 'content が長すぎます',
  INVALID_CATEGORY: 'category が不正です（空にできません。「#」は使えません）',
  CATEGORY_TOO_LONG: 'category が長すぎます',
  NOT_FOUND: '指定された記憶が見つかりません',
  FETCH_FAILED: '記憶の取得に失敗しました',
  UPDATE_FAILED: '記憶の更新に失敗しました',
  DELETE_FAILED: '記憶の削除に失敗しました',
  PIN_FAILED: '記憶の固定に失敗しました',
} as const;

/** PATCH のバリデーションエラーコードをメッセージに対応付ける。 */
export const PATCH_ERROR_TO_MESSAGE = {
  EMPTY_PATCH: MEMORY_ERROR_MESSAGES.EMPTY_PATCH,
  INVALID_CONTENT: MEMORY_ERROR_MESSAGES.INVALID_CONTENT,
  CONTENT_TOO_LONG: MEMORY_ERROR_MESSAGES.CONTENT_TOO_LONG,
  INVALID_CATEGORY: MEMORY_ERROR_MESSAGES.INVALID_CATEGORY,
  CATEGORY_TOO_LONG: MEMORY_ERROR_MESSAGES.CATEGORY_TOO_LONG,
} as const;
