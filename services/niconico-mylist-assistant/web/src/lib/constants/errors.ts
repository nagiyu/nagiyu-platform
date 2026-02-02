/**
 * エラーメッセージ定数
 *
 * ユーザー向けエラーメッセージを一元管理する
 */
export const ERROR_MESSAGES = {
  // 認証エラー
  UNAUTHORIZED: '認証が必要です',

  // バリデーションエラー
  VIDEO_IDS_MUST_BE_ARRAY: 'videoIds は配列である必要があります',
  VIDEO_IDS_EMPTY: 'videoIds を指定してください',
  VIDEO_IDS_TOO_MANY: '一度に登録できる動画は最大 100 件です',
  INVALID_VIDEO_ID_FORMAT: '不正な動画 ID 形式が含まれています',
  IS_FAVORITE_MUST_BE_BOOLEAN: 'isFavorite は真偽値である必要があります',
  IS_SKIP_MUST_BE_BOOLEAN: 'isSkip は真偽値である必要があります',
  MEMO_MUST_BE_STRING: 'memo は文字列である必要があります',
  MEMO_TOO_LONG: 'memo は 1000 文字以内である必要があります',

  // リソースエラー
  VIDEO_NOT_FOUND: '動画が見つかりませんでした',

  // サーバーエラー
  INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました',
} as const;
