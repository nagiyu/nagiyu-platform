import { auth } from '../../auth';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import type { Session } from '@nagiyu/common';
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
  createTestSession: () => {
    const testUserId = process.env.TEST_USER_ID || 'test-user-id';
    return {
      user: {
        userId: testUserId,
        googleId: process.env.TEST_USER_GOOGLE_ID || testUserId,
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        name: process.env.TEST_USER_NAME || 'Test User',
        roles: process.env.TEST_USER_ROLES?.split(',') || [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  },
  mapSession: (session: NextAuthSession): Session => {
    const sessionUser = session.user as NextAuthSession['user'] & {
      id?: string;
      userId?: string;
      googleId?: string;
      roles?: string[];
      createdAt?: string;
      updatedAt?: string;
      lastLoginAt?: string;
    };

    return {
      user: {
        // createAuthConfig() が設定する NextAuth 標準属性 `session.user.id` を `userId` へ正規化する
        userId: sessionUser.userId || sessionUser.id || '',
        googleId: sessionUser.googleId || '',
        email: sessionUser.email || '',
        name: sessionUser.name || '',
        roles: sessionUser.roles || [],
        createdAt: sessionUser.createdAt || new Date(0).toISOString(),
        updatedAt: sessionUser.updatedAt || new Date(0).toISOString(),
        lastLoginAt: sessionUser.lastLoginAt,
      },
      expires: session.expires,
    };
  },
});

export async function getSession(): Promise<Session | null> {
  return getSessionFromAuth();
}
