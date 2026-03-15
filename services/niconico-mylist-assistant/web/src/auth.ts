import NextAuth, { type NextAuthConfig } from 'next-auth';
import { createServiceAuthConfig } from '@nagiyu/nextjs';

/**
 * niconico-mylist-assistant サービスの NextAuth 設定
 *
 * Auth サービスから発行された JWT を検証する。
 * OAuth プロバイダーは Auth サービスで管理されるため定義しない。
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  trustHost: true,
  ...createServiceAuthConfig({ includeSubAsUserIdFallback: true }),
};

const nextAuth = NextAuth(authConfig);

export const { handlers, auth, signIn, signOut } = nextAuth;
