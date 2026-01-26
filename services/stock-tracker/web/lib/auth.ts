/**
 * NextAuth.js Session Management
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 */

import { auth } from '../auth';
import type { Session } from '@nagiyu/common';

/**
 * セッション情報を取得する
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
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
        userId: 'test-user-id',
        googleId: 'test-google-id',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        name: 'Test User',
        roles: process.env.TEST_USER_ROLES?.split(',') || ['stock-user'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    };
  }

  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return {
    user: {
      userId: session.user.id || '',
      googleId: session.user.id || '', // NextAuth doesn't expose googleId separately
      email: session.user.email || '',
      name: session.user.name || '',
      roles: session.user.roles || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    expires: session.expires || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
