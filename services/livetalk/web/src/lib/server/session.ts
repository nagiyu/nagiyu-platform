import { auth } from '@/auth';
import { createSessionGetter } from '@nagiyu/nextjs';
import type { Session } from '@nagiyu/common';
import type { Session as NextAuthSession } from 'next-auth';

/**
 * セッション情報を取得する関数。
 *
 * - Auth サービスから発行された JWT を検証する
 * - `SKIP_AUTH_CHECK=true` の場合はテスト用モックセッションを返す（dev / E2E 向け）
 * - middleware ではなく API Route 側の `withAuth` 用にも利用する
 */
const getSessionFromAuth = createSessionGetter({
  auth,
  createTestSession: () => ({
    user: {
      userId: 'test-user-id',
      googleId: 'test-google-id',
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      name: 'Test User',
      roles: process.env.TEST_USER_ROLES?.split(',') || ['livetalk-user'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }),
  mapSession: (session: NextAuthSession): Session => ({
    user: {
      userId: session.user.id || '',
      googleId: session.user.id || '',
      email: session.user.email || '',
      name: session.user.name || '',
      roles: session.user.roles || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    expires: session.expires || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }),
});

export async function getSession(): Promise<Session | null> {
  return getSessionFromAuth();
}
