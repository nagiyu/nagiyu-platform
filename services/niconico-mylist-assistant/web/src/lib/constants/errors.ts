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

  // サーバーエラー
  INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました',
} as const;
