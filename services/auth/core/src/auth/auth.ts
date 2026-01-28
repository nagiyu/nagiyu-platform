import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import { DynamoDBUserRepository } from '../db/repositories/dynamodb-user-repository';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  MISSING_GOOGLE_CLIENT_ID:
    'Google OAuth クライアント ID が設定されていません。環境変数 GOOGLE_CLIENT_ID を設定してください。',
  MISSING_GOOGLE_CLIENT_SECRET:
    'Google OAuth クライアントシークレットが設定されていません。環境変数 GOOGLE_CLIENT_SECRET を設定してください。',
  MISSING_USER_EMAIL: 'Google OAuth ユーザー情報に email が含まれていません。',
  MISSING_USER_NAME: 'Google OAuth ユーザー情報に name が含まれていません。',
} as const;

// 環境変数の検証（ビルド時以外のみ）
// Next.js のビルド時は環境変数が未設定でも許容する
if (
  process.env.NODE_ENV !== 'test' &&
  typeof window === 'undefined' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn(ERROR_MESSAGES.MISSING_GOOGLE_CLIENT_ID);
  }
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    console.warn(ERROR_MESSAGES.MISSING_GOOGLE_CLIENT_SECRET);
  }
}

// DynamoDB を使用してユーザー情報を永続化
const userRepository = new DynamoDBUserRepository();

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

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    // すべてのクッキーを環境別に分離
    // これにより、dev環境とprod環境で認証フロー全体が混同されなくなる
    sessionToken: {
      name: `__Secure-next-auth.session-token${cookieSuffix}`,
      options: cookieOptions,
    },
    callbackUrl: {
      name: `__Secure-next-auth.callback-url${cookieSuffix}`,
      options: cookieOptions,
    },
    csrfToken: {
      name: `__Host-next-auth.csrf-token${cookieSuffix}`,
      options: {
        ...cookieOptions,
        // __Host- prefix requires domain to be undefined and path to be /
        domain: undefined,
      },
    },
    state: {
      name: `__Secure-next-auth.state${cookieSuffix}`,
      options: cookieOptions,
    },
    pkceCodeVerifier: {
      name: `__Secure-next-auth.pkce.code_verifier${cookieSuffix}`,
      options: cookieOptions,
    },
    nonce: {
      name: `__Secure-next-auth.nonce${cookieSuffix}`,
      options: cookieOptions,
    },
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // 同じドメインへのリダイレクトを許可
      if (url.startsWith(baseUrl)) {
        return url;
      }
      // プラットフォーム内のサービス (*.nagiyu.com) へのリダイレクトを許可
      if (url.match(/^https?:\/\/[^/]*\.nagiyu\.com/)) {
        return url;
      }
      // 外部 URL は拒否して baseUrl にフォールバック
      return baseUrl;
    },
    async signIn({ user, account }) {
      if (!account) {
        return false;
      }

      // email と name の null チェック
      if (!user.email) {
        console.error(ERROR_MESSAGES.MISSING_USER_EMAIL);
        return false;
      }
      if (!user.name) {
        console.error(ERROR_MESSAGES.MISSING_USER_NAME);
        return false;
      }

      await userRepository.upsertUser({
        googleId: account.providerAccountId,
        email: user.email,
        name: user.name,
        picture: user.image || undefined,
      });

      return true;
    },
    async jwt({ token, user, account }) {
      if (account && user) {
        token.googleId = account.providerAccountId;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;

        const dbUser = await userRepository.getUserByGoogleId(account.providerAccountId);
        token.userId = dbUser?.userId;
        token.roles = dbUser?.roles || [];

        if (dbUser) {
          await userRepository.updateLastLogin(dbUser.userId);
        }
      }
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
    signIn: '/signin',
    error: '/auth/error',
  },
};

const nextAuth = NextAuth(authConfig);

export const handlers = nextAuth.handlers;
export const auth = nextAuth.auth;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;
