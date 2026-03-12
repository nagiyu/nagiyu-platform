import { auth } from '../../auth';
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

const TEST_SESSION_DEFAULTS = {
  USER_ID: 'test-user-id',
  USER_EMAIL: 'test@example.com',
  USER_NAME: 'Test User',
} as const;

/**
 * セッション情報を取得する
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 *
 * テスト環境で SKIP_AUTH_CHECK=true の場合、モックセッションを返します。
 *
 * @returns セッション情報、未認証の場合は null
 */
export const getSession = createSessionGetter<AuthSession, Session>({
  auth: getAuthSession,
  createTestSession: () => ({
    user: {
      id: process.env.TEST_USER_ID || TEST_SESSION_DEFAULTS.USER_ID,
      email: process.env.TEST_USER_EMAIL || TEST_SESSION_DEFAULTS.USER_EMAIL,
      name: process.env.TEST_USER_NAME || TEST_SESSION_DEFAULTS.USER_NAME,
      image: process.env.TEST_USER_IMAGE || undefined,
      roles: process.env.TEST_USER_ROLES?.split(',') || ['admin'],
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }),
  mapSession: (session): Session => ({
    ...(session as Session),
    user: {
      id: (session.user as { id?: string })?.id || '',
      email: session.user?.email || '',
      name: session.user?.name || '',
      image: session.user?.image || undefined,
      roles: (session.user as { roles?: string[] })?.roles || [],
    },
    expires: session.expires || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }),
});
