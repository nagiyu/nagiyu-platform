import { auth } from '../../auth';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import type { Session } from '../../types/auth';
import type { Session as NextAuthSession } from 'next-auth';

/**
 * セッション情報を取得する
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 *
 * テスト環境で SKIP_AUTH_CHECK=true の場合、モックセッションを返します。
 *
 * @returns セッション情報、未認証の場合は null
 */
const getSessionFromAuth = createSessionGetter({
  auth,
  createTestSession: () => ({
    user: {
      id: process.env.TEST_USER_ID || 'test-user-id',
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      name: process.env.TEST_USER_NAME || 'Test User',
      image: undefined,
      roles: process.env.TEST_USER_ROLES?.split(',') || [],
    },
  }),
  mapSession: (session: NextAuthSession): Session => ({
    user: {
      id: session.user.id || '',
      email: session.user.email || '',
      name: session.user.name || '',
      image: session.user.image,
      roles: session.user.roles || [],
    },
  }),
});

export async function getSession(): Promise<Session | null> {
  return getSessionFromAuth();
}
