/**
 * NextAuth.js Session Management
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 */

import { auth } from '../auth';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import type { Session } from '@nagiyu/common';

/**
 * セッション情報を取得する
 *
 * Auth サービスから発行された JWT を検証し、セッション情報を返す。
 *
 * テスト環境で SKIP_AUTH_CHECK=true の場合、モックセッションを返します。
 *
 * E2E テストではリクエストヘッダ `x-test-user-roles` によって 1 テスト単位でロールを
 * 差し替えられる。ヘッダが未設定の場合は `TEST_USER_ROLES` 環境変数 → `stock-user` の順に
 * フォールバックする。
 *
 * @returns セッション情報、未認証の場合は null
 */
export const getSession = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
  defaultRoles: ['stock-user'],
});
