import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import { createAuthConfig } from '@nagiyu/nextjs';
import { reportErrorEvent } from '@nagiyu/aws';
import { toErrorMessage } from '@nagiyu/common';
import { createUserRepository } from '../repositories/factory';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  MISSING_GOOGLE_CLIENT_ID:
    'Google OAuth クライアント ID が設定されていません。環境変数 GOOGLE_CLIENT_ID を設定してください。',
  MISSING_GOOGLE_CLIENT_SECRET:
    'Google OAuth クライアントシークレットが設定されていません。環境変数 GOOGLE_CLIENT_SECRET を設定してください。',
  MISSING_USER_EMAIL: 'Google OAuth ユーザー情報に email が含まれていません。',
  MISSING_USER_NAME: 'Google OAuth ユーザー情報に name が含まれていません。',
  ROLES_REFRESH_FAILED: 'jwt コールバック: DB からのロール再取得に失敗しました。',
} as const;

/**
 * auth ドメインのセッション読み取り時に最大この間隔で DynamoDB を再取得する（5 分）
 */
const ROLES_REFRESH_TTL_MS = 5 * 60 * 1000;

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

// UserRepository は Next.js のビルド時に初期化されないよう、コールバック内で都度取得する。
// registry 側でシングルトン化されるため複数回呼び出しても同一インスタンスが返る。
const sharedAuthConfig = createAuthConfig({
  jwt: async ({ token, user, account, trigger }) => {
    if (account && user) {
      // ログイン時: Google アカウント情報をトークンに焼き込む
      token.googleId = account.providerAccountId;
      token.email = user.email;
      token.name = user.name;
      token.picture = user.image;

      const userRepository = createUserRepository();
      const dbUser = await userRepository.getUserByGoogleId(account.providerAccountId);
      token.userId = dbUser?.userId;
      token.roles = dbUser?.roles || [];
      token.rolesRefreshedAt = Date.now();

      if (dbUser) {
        await userRepository.updateLastLogin(dbUser.userId);
      }
    } else if (token.googleId) {
      // ログイン以外の呼び出し: TTL ゲートまたは明示的な update トリガーでロールを再取得する
      // token は Record<string, unknown> と交差するため、カスタムフィールドは型アサーションが必要
      const rolesRefreshedAt = (token.rolesRefreshedAt as number | undefined) ?? 0;
      const shouldRefresh =
        trigger === 'update' || Date.now() - rolesRefreshedAt > ROLES_REFRESH_TTL_MS;

      if (shouldRefresh) {
        try {
          const userRepository = createUserRepository();
          const dbUser = await userRepository.getUserByGoogleId(token.googleId as string);
          if (dbUser) {
            token.roles = dbUser.roles ?? [];
            token.userId = dbUser.userId;
          }
          token.rolesRefreshedAt = Date.now();
        } catch (error) {
          await reportErrorEvent({
            serviceId: 'auth',
            severity: 'error',
            title: 'jwt コールバック: DB からのロール再取得に失敗しました',
            message: ERROR_MESSAGES.ROLES_REFRESH_FAILED,
            context: {
              step: 'rolesRefresh',
              errorStack: error instanceof Error ? error.stack : undefined,
            },
          });
          // DB エラー時はセッションを壊さず既存トークンをそのまま返す
        }
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
        await reportErrorEvent({
          serviceId: 'auth',
          severity: 'error',
          title: 'signIn: OAuth ユーザー情報に email がありません',
          message: ERROR_MESSAGES.MISSING_USER_EMAIL,
          context: { step: 'signIn' },
        });
        return false;
      }
      if (!user.name) {
        console.error(ERROR_MESSAGES.MISSING_USER_NAME);
        await reportErrorEvent({
          serviceId: 'auth',
          severity: 'error',
          title: 'signIn: OAuth ユーザー情報に name がありません',
          message: ERROR_MESSAGES.MISSING_USER_NAME,
          context: { step: 'signIn' },
        });
        return false;
      }

      const userRepository = createUserRepository();
      try {
        await userRepository.upsertUser({
          googleId: account.providerAccountId,
          email: user.email,
          name: user.name,
          picture: user.image || undefined,
        });
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        await reportErrorEvent({
          serviceId: 'auth',
          severity: 'error',
          title: 'signIn: ユーザー upsert エラー',
          message: errorMessage,
          context: {
            step: 'upsertUser',
            errorStack: error instanceof Error ? error.stack : undefined,
          },
        });
        return false;
      }

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
