import NextAuth, { type NextAuthConfig } from 'next-auth';

// 環境判定
// - ローカル開発環境: NODE_ENV === 'development'
// - dev 環境: NODE_ENV === 'dev'
// - prod 環境: NODE_ENV === 'prod'
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = (process.env.NODE_ENV as string) === 'prod';

/**
 * Admin サービスの NextAuth 設定
 *
 * Auth サービスから発行された JWT を検証する。
 * OAuth プロバイダーは Auth サービスで管理されるため定義しない。
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      // 環境別のクッキー名でdev環境とprod環境を分離
      // - ローカル開発環境: __Secure-next-auth.session-token (localhost専用)
      // - dev環境: __Secure-next-auth.session-token.dev (dev-*.nagiyu.comで共有)
      // - prod環境: __Secure-next-auth.session-token (*.nagiyu.comで共有)
      name: isProduction
        ? `__Secure-next-auth.session-token`
        : isDevelopment
          ? `__Secure-next-auth.session-token`
          : `__Secure-next-auth.session-token.dev`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        // 全環境で .nagiyu.com を設定してSSO共有を実現
        // ローカル開発環境のみ未設定（localhost専用）
        domain: isDevelopment ? undefined : '.nagiyu.com',
        // ローカル開発環境では secure を false にする
        secure: !isDevelopment,
      },
    },
  },
  callbacks: {
    async jwt({ token }) {
      return token;
    },
    async session({ session, token }) {
      session.user.id = (token.userId as string) || '';
      session.user.email = (token.email as string) || '';
      session.user.name = (token.name as string) || '';
      session.user.image = (token.picture as string) || undefined;
      session.user.roles = (token.roles as string[]) || [];
      return session;
    },
  },
  pages: {
    signIn: `${process.env.NEXT_PUBLIC_AUTH_URL}/signin`,
  },
};

const nextAuth = NextAuth(authConfig);

export const { handlers, auth, signIn, signOut } = nextAuth;
