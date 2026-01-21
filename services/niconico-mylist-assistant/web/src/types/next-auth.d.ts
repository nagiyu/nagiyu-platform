/**
 * NextAuth の型定義拡張
 *
 * プラットフォーム全体で共通の JWT 構造を定義。
 * Auth サービスで発行した JWT を niconico-mylist-assistant サービスで検証する際に、
 * 同じ型定義を使用することで型安全性を確保する。
 *
 * Note: この型定義は Auth サービス (services/auth/core/src/types/next-auth.d.ts) と
 * 同一の内容を保持する必要がある。将来的には共通ライブラリ（@nagiyu/common など）に
 * 移行し、複数のサービス間で共有することを検討する。
 */
import 'next-auth';

declare module 'next-auth' {
  /**
   * セッション情報の拡張
   */
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      roles: string[];
    };
  }

  /**
   * ユーザー情報の拡張
   */
  interface User {
    id: string;
    email: string;
    name: string;
    image?: string;
  }
}

declare module 'next-auth/jwt' {
  /**
   * JWT トークンの拡張
   */
  interface JWT {
    userId?: string;
    googleId?: string;
    email?: string;
    name?: string;
    picture?: string;
    roles?: string[];
  }
}
