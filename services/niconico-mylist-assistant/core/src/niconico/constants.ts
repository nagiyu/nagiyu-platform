/**
 * ニコニコ動画 API クライアントで使用するエラーメッセージ定数
 */
export const NICONICO_ERROR_MESSAGES = {
  HTTP_ERROR: 'HTTPエラーが発生しました',
  API_ERROR: 'APIエラーが発生しました',
  FETCH_ERROR: '動画情報の取得に失敗しました',
} as const;

/**
 * デフォルト設定値
 */
export const DEFAULT_BATCH_CONCURRENCY = 3;
