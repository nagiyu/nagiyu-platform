/**
 * NextAuth TypeScript 型拡張
 *
 * Session と JWT に Stock Tracker で必要なカスタムフィールドを追加
 */

import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  /**
   * セッション型の拡張
   */
  interface Session {
    user: {
      /** ユーザーID */
      id: string;
      /** メールアドレス */
      email: string;
      /** ユーザー名 */
      name: string;
      /** プロフィール画像URL */
      image?: string;
      /** ユーザーに割り当てられたロールID配列 */
      roles: string[];
    };
  }

  /**
   * User 型の拡張
   */
  interface User {
    /** ユーザーID */
    id: string;
    /** メールアドレス */
    email: string;
    /** ユーザー名 */
    name: string;
    /** プロフィール画像URL */
    image?: string;
    /** ユーザーに割り当てられたロールID配列 */
    roles: string[];
  }
}

declare module 'next-auth/jwt' {
  /**
   * JWT 型の拡張
   */
  interface JWT {
    /** ユーザーID */
    userId?: string;
    /** メールアドレス */
    email?: string;
    /** ユーザー名 */
    name?: string;
    /** プロフィール画像URL */
    picture?: string;
    /** ユーザーに割り当てられたロールID配列 */
    roles?: string[];
  }
}
