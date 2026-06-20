import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';

/**
 * エラーメッセージ定数
 *
 * ユーザー向けエラーメッセージを一元管理する
 */
export const ERROR_MESSAGES = {
  ...COMMON_ERROR_MESSAGES,

  // 認証エラー
  VIDEO_IDS_MUST_BE_ARRAY: 'videoIds は配列である必要があります',
  VIDEO_IDS_EMPTY: 'videoIds を指定してください',
  VIDEO_IDS_TOO_MANY: '一度に登録できる動画は最大 100 件です',
  INVALID_VIDEO_ID_FORMAT: '不正な動画 ID 形式が含まれています',
  SEARCH_KEYWORD_REQUIRED: '検索キーワードを入力してください',
  SEARCH_KEYWORD_TOO_LONG: '検索キーワードは 100 文字以内で入力してください',
  VIDEO_SEARCH_FAILED: '動画検索に失敗しました',
  VIDEO_ADD_FAILED: '動画の追加に失敗しました',
  IS_FAVORITE_MUST_BE_BOOLEAN: 'isFavorite は真偽値である必要があります',
  IS_SKIP_MUST_BE_BOOLEAN: 'isSkip は真偽値である必要があります',
  MEMO_MUST_BE_STRING: 'memo は文字列である必要があります',
  MEMO_TOO_LONG: 'memo は 1000 文字以内である必要があります',

  // リソースエラー
  VIDEO_NOT_FOUND: '動画が見つかりませんでした',
  TEST_ENDPOINT_NOT_AVAILABLE: 'このエンドポイントはテスト環境でのみ利用可能です',

  // バッチジョブエラー
  MAX_COUNT_MUST_BE_NUMBER: 'maxCount は数値である必要があります',
  MAX_COUNT_INVALID_RANGE: 'maxCount は 1 以上 100 以下である必要があります',
  MYLIST_REGISTER_MAX_COUNT_MUST_BE_INTEGER: '登録件数は整数で指定してください',
  MYLIST_REGISTER_MAX_COUNT_INVALID_RANGE: '登録件数は1～100の範囲で指定してください',
  MYLIST_NAME_REQUIRED: 'mylistName は必須です',
  MYLIST_NAME_MUST_BE_STRING: 'mylistName は文字列である必要があります',
  USER_SESSION_REQUIRED: 'user_session は必須です',
  USER_SESSION_MUST_BE_STRING: 'user_session は文字列である必要があります',
  NO_VIDEOS_AVAILABLE: '登録可能な動画が見つかりませんでした',
  MYLIST_REGISTER_VIDEO_FETCH_FAILED: '動画情報の取得に失敗しました',
  BATCH_JOB_SUBMISSION_FAILED: 'バッチジョブの投入に失敗しました',
  DATABASE_ERROR: 'データベースへのアクセスに失敗しました',
  USER_SESSION_ENCRYPTION_FAILED: 'user_session の暗号化に失敗しました',

  // リクエストエラー
  INVALID_REQUEST_BODY: 'リクエストボディが不正な JSON です',

  // セッション管理 API エラー
  NICONICO_SESSION_NOT_REGISTERED:
    'ニコニコ動画のセッションが未登録です。セッション管理から user_session を登録してください',
  NICONICO_SESSION_INVALID:
    'user_session が無効です。シークレット窓でニコニコ動画にログインし、最新の user_session を取得してください',
  NICONICO_SESSION_VALIDATION_INDETERMINATE:
    'セッションの有効性を判定できませんでした。時間をおいて再試行してください',
  NICONICO_SESSION_DECRYPT_FAILED: '保存済みセッションの復号に失敗しました',
  NICONICO_SESSION_SAVE_FAILED: 'セッションの保存に失敗しました',
  NICONICO_SESSION_DELETE_FAILED: 'セッションの削除に失敗しました',
  NICONICO_SESSION_STATUS_FETCH_FAILED: 'セッション状態の取得に失敗しました',
} as const;

export const VALIDATION_LIMITS = {
  SEARCH_KEYWORD_MAX_LENGTH: 100,
} as const;
