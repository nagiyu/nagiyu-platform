/**
 * 記憶 API（`/api/memory`）のエラーメッセージ定数（日本語）。
 */
export const MEMORY_ERROR_MESSAGES = {
  INVALID_TIER: 'Tier の指定が不正です',
  INVALID_CHARACTER: 'キャラクター ID が不正です',
  INVALID_ID: '記憶 ID が不正です',
  NOT_FOUND: '指定された記憶が見つかりません',
  FETCH_FAILED: '記憶の取得に失敗しました',
  DELETE_FAILED: '記憶の削除に失敗しました',
  PIN_FAILED: '記憶の固定に失敗しました',
} as const;
