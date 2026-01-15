/**
 * ユーザー情報の型定義
 */
export interface User {
  /**
   * ユーザーID
   */
  id?: string;
  /**
   * メールアドレス
   */
  email: string;
  /**
   * 表示名
   */
  name?: string;
  /**
   * プロフィール画像URL
   */
  image?: string;
  /**
   * 割り当てられたロール（複数可）
   */
  roles: string[];
}

/**
 * セッション情報の型定義
 */
export interface Session {
  /**
   * ユーザー情報
   */
  user: User;
}
