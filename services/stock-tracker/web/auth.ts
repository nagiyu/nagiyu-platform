import NextAuth, { type NextAuthConfig } from 'next-auth';
import { createServiceAuthConfig } from '@nagiyu/nextjs';

/**
 * Stock Tracker サービスの NextAuth 設定
 *
 * Auth サービスから発行された JWT を検証する。
 * OAuth プロバイダーは Auth サービスで管理されるため定義しない。
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  ...createServiceAuthConfig(),
};

const nextAuth = NextAuth(authConfig);

export const { handlers, auth, signIn, signOut } = nextAuth;
