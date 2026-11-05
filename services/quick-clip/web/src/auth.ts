import NextAuth, { type NextAuthConfig } from 'next-auth';
import { createServiceAuthConfig } from '@nagiyu/nextjs';

/**
 * Quick Clip の NextAuth 設定
 *
 * Auth サービスが発行した JWT を検証するだけで、OAuth プロバイダーは Auth サービス側で管理する。
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  trustHost: true,
  ...createServiceAuthConfig({ includeSubAsUserIdFallback: true }),
};

const nextAuth = NextAuth(authConfig);

export const { handlers, auth, signIn, signOut } = nextAuth;
