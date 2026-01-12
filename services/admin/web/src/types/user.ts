/**
 * ユーザー情報の型定義
 */
export interface User {
  /**
   * ユーザーのメールアドレス
   */
  email: string;

  /**
   * ユーザーに割り当てられたロール
   */
  roles: string[];
}
