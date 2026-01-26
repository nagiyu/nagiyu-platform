import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  /**
   * ユーザーセッション情報の型定義
   */
  interface Session {
    user: {
      /** ユーザーID */
      id: string;
      /** メールアドレス */
      email: string;
      /** 表示名 */
      name?: string | null;
      /** プロフィール画像URL */
      image?: string | null;
      /** 割り当てられたロール（複数可） */
      roles: string[];
    } & DefaultSession['user'];
  }

  /**
   * JWT トークン情報の型定義
   */
  interface JWT {
    /** ユーザーID */
    userId?: string;
    /** メールアドレス */
    email?: string;
    /** 表示名 */
    name?: string;
    /** プロフィール画像URL */
    picture?: string;
    /** 割り当てられたロール（複数可） */
    roles?: string[];
  }

  /**
   * ユーザー情報の型定義
   */
  interface User {
    /** ユーザーID */
    id: string;
    /** メールアドレス */
    email: string;
    /** 表示名 */
    name?: string | null;
    /** プロフィール画像URL */
    image?: string | null;
    /** 割り当てられたロール（複数可） */
    roles: string[];
  }
}
