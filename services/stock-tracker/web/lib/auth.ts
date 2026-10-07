/**
 * NextAuth.js Session Management
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 */

import { auth } from '../auth';
import {
  createSessionGetter,
  createTestSessionExpires,
  resolveTestUser,
} from '@nagiyu/nextjs/session';
import type { Session } from '@nagiyu/common';
import type { Session as NextAuthSession } from 'next-auth';

/**
 * セッション情報を取得する
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 *
 * テスト環境で SKIP_AUTH_CHECK=true の場合、モックセッションを返します。
 *
 * E2E テストではリクエストヘッダ `x-test-user-roles` によって 1 テスト単位でロールを
 * 差し替えられる（`@nagiyu/nextjs` の `createSessionGetter` がヘッダを解決して渡す）。
 * ヘッダが未設定の場合は `TEST_USER_ROLES` 環境変数 → `stock-user` の順にフォールバックする。
 *
 * @returns セッション情報、未認証の場合は null
 */
const getSessionFromAuth = createSessionGetter({
  auth,
  createTestSession: (overrides) => {
    const u = resolveTestUser({ defaultRoles: ['stock-user'], roles: overrides?.roles });
    return {
      user: {
        userId: u.id,
        googleId: 'test-google-id',
        email: u.email,
        name: u.name,
        roles: u.roles,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      expires: createTestSessionExpires(),
    };
  },
  mapSession: (session: NextAuthSession): Session => ({
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
  }),
});

export async function getSession(): Promise<Session | null> {
  return getSessionFromAuth();
}
