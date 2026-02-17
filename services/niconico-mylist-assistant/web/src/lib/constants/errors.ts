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
  TEST_ENDPOINT_NOT_AVAILABLE: 'このエンドポイントはテスト環境でのみ利用可能です',

  // サーバーエラー
  INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました',

  // バッチジョブエラー
  MAX_COUNT_MUST_BE_NUMBER: 'maxCount は数値である必要があります',
  MAX_COUNT_INVALID_RANGE: 'maxCount は 1 以上 100 以下である必要があります',
  MYLIST_REGISTER_MAX_COUNT_MUST_BE_INTEGER: '登録件数は整数で指定してください',
  MYLIST_REGISTER_MAX_COUNT_INVALID_RANGE: '登録件数は1～100の範囲で指定してください',
  MYLIST_NAME_REQUIRED: 'mylistName は必須です',
  MYLIST_NAME_MUST_BE_STRING: 'mylistName は文字列である必要があります',
  NICONICO_ACCOUNT_REQUIRED: 'ニコニコアカウント情報は必須です',
  NICONICO_EMAIL_REQUIRED: 'メールアドレスは必須です',
  NICONICO_PASSWORD_REQUIRED: 'パスワードは必須です',
  NO_VIDEOS_AVAILABLE: '登録可能な動画が見つかりませんでした',
  MYLIST_REGISTER_VIDEO_FETCH_FAILED: '動画情報の取得に失敗しました',
  BATCH_JOB_SUBMISSION_FAILED: 'バッチジョブの投入に失敗しました',
  DATABASE_ERROR: 'データベースへのアクセスに失敗しました',
  PASSWORD_ENCRYPTION_FAILED: 'パスワードの暗号化に失敗しました',
} as const;
