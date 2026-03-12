import { auth } from '@nagiyu/auth-core';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import type { Session } from 'next-auth';

type AuthSession = {
  user?: Session['user'] & {
    id?: string;
    roles?: string[];
  };
  expires?: string;
};

const getAuthSession = auth as () => Promise<AuthSession | null>;

/**
 * セッション情報を取得する
 *
 * NextAuth の JWT を検証し、セッション情報を返す。
 *
 * テスト環境で SKIP_AUTH_CHECK=true の場合、モックセッションを返します。
 *
 * @returns セッション情報、未認証の場合は null
 */
export const getSession = createSessionGetter<AuthSession, Session>({
  auth: getAuthSession,
  createTestSession: () => ({
    user: {
      id: 'test-user-id',
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      name: 'Test User',
      image: undefined,
      roles: process.env.TEST_USER_ROLES?.split(',') || ['admin'],
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }),
  mapSession: (session): Session => ({
    ...(session as Session),
    expires: session.expires || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }),
});
