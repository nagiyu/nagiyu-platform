import NextAuth, { type NextAuthConfig } from 'next-auth';

// 環境判定
// - ローカル開発環境: NODE_ENV === 'development'
// - dev 環境: NODE_ENV === 'dev'
// - prod 環境: NODE_ENV === 'prod'
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = (process.env.NODE_ENV as string) === 'prod';

// 共通のクッキーオプション
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  // 全環境で .nagiyu.com を設定してSSO共有を実現
  // ローカル開発環境のみ未設定（localhost専用）
  domain: isDevelopment ? undefined : '.nagiyu.com',
  // ローカル開発環境では secure を false にする
  secure: !isDevelopment,
};

// 環境別クッキー名のサフィックス
// - prod環境: サフィックスなし
// - dev環境: .dev サフィックス
// - local環境: サフィックスなし（localhost専用）
const cookieSuffix = isProduction ? '' : isDevelopment ? '' : '.dev';

/**
 * niconico-mylist-assistant サービスの NextAuth 設定
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
    // すべてのクッキーを環境別に分離
    // これにより、dev環境とprod環境で認証フロー全体が混同されなくなる
    // NextAuth v5 では authjs.* がデフォルトのプレフィックス
    sessionToken: {
      name: `__Secure-authjs.session-token${cookieSuffix}`,
      options: cookieOptions,
    },
    callbackUrl: {
      name: `__Secure-authjs.callback-url${cookieSuffix}`,
      options: cookieOptions,
    },
    csrfToken: {
      name: `__Host-authjs.csrf-token${cookieSuffix}`,
      options: {
        ...cookieOptions,
        // __Host- prefix requires domain to be undefined and path to be /
        domain: undefined,
      },
    },
    state: {
      name: `__Secure-authjs.state${cookieSuffix}`,
      options: cookieOptions,
    },
    pkceCodeVerifier: {
      name: `__Secure-authjs.pkce.code_verifier${cookieSuffix}`,
      options: cookieOptions,
    },
    nonce: {
      name: `__Secure-authjs.nonce${cookieSuffix}`,
      options: cookieOptions,
    },
  },
  callbacks: {
    async jwt({ token }) {
      return token;
    },
    async session({ session, token }) {
      session.user.id = (token.userId as string) || (token.sub as string) || '';
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
