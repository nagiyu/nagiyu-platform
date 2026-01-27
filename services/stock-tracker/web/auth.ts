import NextAuth, { type NextAuthConfig } from 'next-auth';

// 環境判定
// - ローカル開発環境: NODE_ENV === 'development'
// - dev 環境: NODE_ENV === 'dev'
// - prod 環境: NODE_ENV === 'prod'
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = (process.env.NODE_ENV as string) === 'prod';

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
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        // ローカル開発環境とdev環境では domain を設定しない（サブドメイン共有不要）
        // prod環境では .nagiyu.com を設定（全サブドメインでSSO共有）
        domain: isProduction ? '.nagiyu.com' : undefined,
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
