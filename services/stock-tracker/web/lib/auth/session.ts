import { auth } from '../../auth';
import type { Session } from '../../types/auth';

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
        id: 'test-user-id',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        name: 'Test User',
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
      id: session.user.id || '',
      email: session.user.email || '',
      name: session.user.name || '',
      image: session.user.image || undefined,
      roles: session.user.roles || [],
    },
  };
}
