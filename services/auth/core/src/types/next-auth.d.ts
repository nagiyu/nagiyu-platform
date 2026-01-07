/**
 * NextAuth の型定義拡張
 *
 * プラットフォーム全体で共通の JWT 構造を定義。
 * Auth サービスで発行した JWT を他のサービス（Admin など）で検証する際に、
 * 同じ型定義を使用することで型安全性を確保する。
 *
 * Note: 将来的にはこの型定義を共通ライブラリ（@nagiyu/common など）に移行し、
 * 複数のサービス間で共有することを検討する。
 */
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      roles: string[];
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    image?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    googleId?: string;
    email?: string;
    name?: string;
    picture?: string;
    roles?: string[];
  }
}
