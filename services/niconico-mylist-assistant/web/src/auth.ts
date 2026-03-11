import NextAuth, { type NextAuthConfig } from 'next-auth';
import { createAuthConfig } from '@nagiyu/nextjs';

/**
 * niconico-mylist-assistant サービスの NextAuth 設定
 *
 * Auth サービスから発行された JWT を検証する。
 * OAuth プロバイダーは Auth サービスで管理されるため定義しない。
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  trustHost: true,
  ...createAuthConfig({ includeSubAsUserIdFallback: true }),
  pages: {
    signIn: `${process.env.NEXT_PUBLIC_AUTH_URL}/signin`,
  },
};

const nextAuth = NextAuth(authConfig);

export const { handlers, auth, signIn, signOut } = nextAuth;
