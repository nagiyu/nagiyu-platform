import NextAuth, { type NextAuthConfig } from 'next-auth';

// 開発環境判定
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Admin サービスの NextAuth 設定
 *
 * Auth サービスで発行された JWT を検証するための設定。
 * OAuth プロバイダーは Auth サービスで管理されるため、ここでは定義しない。
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days (Auth サービスと同じ)
  },
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        // Auth サービスと同じドメイン設定で Cookie を共有
        domain: isDevelopment ? undefined : '.nagiyu.com',
        secure: !isDevelopment,
      },
    },
  },
  callbacks: {
    async jwt({ token }) {
      // Auth サービスから発行された JWT をそのまま使用
      // JWT の検証は NextAuth が自動的に行う
      return token;
    },
    async session({ session, token }) {
      // JWT から取得した情報をセッションに設定
      session.user.id = (token.userId as string) || '';
      session.user.email = (token.email as string) || '';
      session.user.name = (token.name as string) || '';
      session.user.image = (token.picture as string) || undefined;
      session.user.roles = (token.roles as string[]) || [];
      return session;
    },
  },
  pages: {
    // 未認証時は Auth サービスのサインインページにリダイレクト
    signIn: `${process.env.NEXT_PUBLIC_AUTH_URL}/signin`,
  },
};

const nextAuth = NextAuth(authConfig);

export const { handlers, auth, signIn, signOut } = nextAuth;
