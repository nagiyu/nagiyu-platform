/**
 * Auth Type Definitions
 *
 * Stock Tracker サービスで使用する認証関連の型定義
 */

/**
 * ユーザー情報
 */
export interface User {
  /**
   * メールアドレス
   */
  email: string;

  /**
   * ロール（権限）
   */
  roles: string[];
}

/**
 * セッション情報
 */
export interface Session {
  /**
   * ユーザー情報
   */
  user: User;
}
