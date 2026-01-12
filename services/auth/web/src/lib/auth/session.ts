import { auth } from '@nagiyu/auth-core';
import type { Session } from 'next-auth';

/**
 * セッション情報を取得する
 *
 * NextAuth の JWT を検証し、セッション情報を返す。
 *
 * テスト環境で SKIP_AUTH_CHECK=true の場合、モックセッションを返します。
 *
 * @returns セッション情報、未認証の場合は null
 */
export async function getSession(): Promise<Session | null> {
  // テスト環境で認証をスキップする場合、モックセッションを返す
  if (process.env.SKIP_AUTH_CHECK === 'true') {
    return {
      user: {
        id: 'test-user-id',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        name: 'Test User',
        image: undefined,
        roles: process.env.TEST_USER_ROLES?.split(',') || ['admin'],
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return session;
}
