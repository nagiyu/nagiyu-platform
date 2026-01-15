/**
 * NextAuth.js Session Management
 *
 * Web層でのセッション取得を担当
 * 認証・認可ロジックは core/services/auth.ts に実装
 */

import type { Session } from '@nagiyu/common';

/**
 * セッション情報を取得する
 *
 * TODO: NextAuth.js統合後に実装
 * 現在はモックセッションを返す（開発用）
 *
 * @returns セッション情報、未認証の場合は null
 */
export async function getSession(): Promise<Session | null> {
  // TODO: Phase 0.6 完了後、NextAuth.js の auth() を使用
  // テスト環境で認証をスキップする場合、モックセッションを返す
  if (process.env.SKIP_AUTH_CHECK === 'true' || process.env.NODE_ENV === 'development') {
    return {
      user: {
        userId: process.env.TEST_USER_ID || 'test-user-id',
        googleId: 'test-google-id',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        name: process.env.TEST_USER_NAME || 'Test User',
        roles: process.env.TEST_USER_ROLES?.split(',') || ['stock-user'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // TODO: NextAuth.js統合後に以下を有効化
  // const session = await auth();
  // if (!session?.user) {
  //   return null;
  // }
  // return session;

  return null;
}

