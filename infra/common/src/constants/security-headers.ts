/**
 * Strict-Transport-Security ヘッダー設定
 */
export const HSTS_HEADER = {
  /**
   * max-age (秒): 2年間
   */
  accessControlMaxAge: 63072000,
  /**
   * includeSubDomains: サブドメインにも適用
   */
  includeSubdomains: true,
  /**
   * preload: HSTS プリロードリストに登録可能
   */
  preload: true,
  /**
   * override: 既存のヘッダーを上書き
   */
  override: true,
} as const;

/**
 * X-Content-Type-Options ヘッダー設定
 */
export const CONTENT_TYPE_OPTIONS_HEADER = {
  /**
   * override: 既存のヘッダーを上書き
   */
  override: true,
} as const;

/**
 * X-Frame-Options ヘッダー設定
 */
export const FRAME_OPTIONS_HEADER = {
  /**
   * frameOption: DENY（フレーム内での表示を拒否）
   */
  frameOption: 'DENY',
  /**
   * override: 既存のヘッダーを上書き
   */
  override: true,
} as const;

/**
 * X-XSS-Protection ヘッダー設定
 */
export const XSS_PROTECTION_HEADER = {
  /**
   * protection: XSS フィルタを有効化
   */
  protection: true,
  /**
   * modeBlock: XSS を検出した場合はページをブロック
   */
  modeBlock: true,
  /**
   * override: 既存のヘッダーを上書き
   */
  override: true,
} as const;

/**
 * Referrer-Policy ヘッダー設定
 */
export const REFERRER_POLICY_HEADER = {
  /**
   * referrerPolicy: strict-origin-when-cross-origin
   * 同一オリジンへのリクエストには完全なリファラーを送信、
   * クロスオリジンへのリクエストにはオリジンのみを送信
   */
  referrerPolicy: 'strict-origin-when-cross-origin',
  /**
   * override: 既存のヘッダーを上書き
   */
  override: true,
} as const;

/**
 * Permissions-Policy ヘッダー設定
 */
export const PERMISSIONS_POLICY_HEADER = {
  /**
   * カメラ: 無効
   */
  camera: 'none',
  /**
   * マイク: 無効
   */
  microphone: 'none',
  /**
   * 位置情報: 無効
   */
  geolocation: 'none',
  /**
   * 支払いリクエスト: 無効
   */
  payment: 'none',
} as const;

/**
 * セキュリティヘッダーの完全なセット
 */
export const SECURITY_HEADERS = {
  strictTransportSecurity: HSTS_HEADER,
  contentTypeOptions: CONTENT_TYPE_OPTIONS_HEADER,
  frameOptions: FRAME_OPTIONS_HEADER,
  xssProtection: XSS_PROTECTION_HEADER,
  referrerPolicy: REFERRER_POLICY_HEADER,
} as const;
