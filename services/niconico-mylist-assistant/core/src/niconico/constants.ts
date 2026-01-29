/**
 * ニコニコ動画 API クライアントで使用するエラーメッセージ定数
 */
export const NICONICO_ERROR_MESSAGES = {
  HTTP_ERROR: 'HTTP エラーが発生しました',
  UNKNOWN_API_ERROR: '不明な API エラーが発生しました',
  FETCH_ERROR: '動画情報の取得に失敗しました',
  UNKNOWN_ERROR: '不明なエラーが発生しました',
} as const;

/**
 * デフォルト設定値
 */
export const DEFAULT_BATCH_CONCURRENCY = 3;
