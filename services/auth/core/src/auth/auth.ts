import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import { createAuthConfig } from '@nagiyu/nextjs';
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

const sharedAuthConfig = createAuthConfig({
  jwt: async ({ token, user, account }) => {
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
});
const { callbacks: sharedCallbacks, ...sharedAuthConfigWithoutCallbacks } = sharedAuthConfig;

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
  ...sharedAuthConfigWithoutCallbacks,
  callbacks: {
    ...sharedCallbacks,
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
