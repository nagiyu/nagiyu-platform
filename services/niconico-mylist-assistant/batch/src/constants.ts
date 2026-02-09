/**
 * Playwright 自動化スクリプトの定数定義
 */

/**
 * エラーメッセージ定数（日本語）
 */
export const ERROR_MESSAGES = {
  // ログイン関連
  LOGIN_FAILED: 'ニコニコ動画へのログインに失敗しました',
  LOGIN_TIMEOUT: 'ログイン処理がタイムアウトしました',
  INVALID_CREDENTIALS: 'メールアドレスまたはパスワードが正しくありません',
  TWO_FACTOR_AUTH_REQUIRED: '二段階認証が必要です',
  TWO_FACTOR_AUTH_TIMEOUT: '二段階認証コードの入力待機がタイムアウトしました',

  // マイリスト操作関連
  MYLIST_CREATE_FAILED: 'マイリストの作成に失敗しました',
  MYLIST_DELETE_FAILED: 'マイリストの削除に失敗しました',
  VIDEO_REGISTRATION_FAILED: '動画の登録に失敗しました',

  // パラメータ関連
  MISSING_ENV_VARS: '必要な環境変数が設定されていません',
  INVALID_PARAMETERS: 'ジョブパラメータが不正です',

  // 暗号化関連
  DECRYPTION_FAILED: 'パスワードの復号化に失敗しました',

  // その他
  BROWSER_LAUNCH_FAILED: 'ブラウザの起動に失敗しました',
  SCREENSHOT_FAILED: 'スクリーンショットの取得に失敗しました',
  UNKNOWN_ERROR: '不明なエラーが発生しました',
} as const;

/**
 * ニコニコ動画のURL
 */
export const NICONICO_URLS = {
  LOGIN: 'https://account.nicovideo.jp/login',
  MYLIST: 'https://www.nicovideo.jp/my/mylist',
  VIDEO: 'https://www.nicovideo.jp/watch/',
} as const;

/**
 * リトライ設定のデフォルト値
 */
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000, // 2秒
} as const;

/**
 * タイムアウト設定（ミリ秒）
 */
export const TIMEOUTS = {
  LOGIN: 30000, // 30秒
  NAVIGATION: 30000, // 30秒
  VIDEO_REGISTRATION: 10000, // 10秒
  TWO_FACTOR_AUTH_WAIT: 300000, // 5分（二段階認証コード入力待ち）
} as const;

/**
 * 動画登録間の待機時間（ミリ秒）
 * ニコニコ動画サーバーへの配慮のため、最低2秒待機
 */
export const VIDEO_REGISTRATION_WAIT = 2000; // 2秒

/**
 * 二段階認証コードポーリング間隔（ミリ秒）
 */
export const TWO_FACTOR_AUTH_POLL_INTERVAL = 5000; // 5秒
