/**
 * NextAuth.js Session Management
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 * Admin サービスと同じ実装パターンを使用。
 */

import { auth } from '../auth';
import type { Session } from '../types/auth';

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
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        roles: process.env.TEST_USER_ROLES?.split(',') || ['stock-user'],
      },
    };
  }

  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return {
    user: {
      email: session.user.email || '',
      roles: session.user.roles || [],
    },
  };
}
