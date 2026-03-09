/**
 * ニコニコ動画 API クライアントで使用するエラーメッセージ定数
 */
export const NICONICO_ERROR_MESSAGES = {
  HTTP_ERROR: 'HTTPエラーが発生しました',
  API_ERROR: 'APIエラーが発生しました',
  FETCH_ERROR: '動画情報の取得に失敗しました',
  SEARCH_KEYWORD_REQUIRED: '検索キーワードを入力してください',
  SEARCH_HTTP_ERROR: '動画検索に失敗しました',
} as const;

/**
 * デフォルト設定値
 */
export const DEFAULT_BATCH_CONCURRENCY = 3;
export const NICONICO_SEARCH_URL_BASE = 'https://www.nicovideo.jp/search/';
export const SEARCH_RESULT_LIMIT = 10;
// ニコニコ動画IDの代表的な接頭辞（sm/nm/so）を抽出対象にする
export const SEARCH_VIDEO_ID_PATTERN = /\b(?:sm|nm|so)\d+\b/g;
