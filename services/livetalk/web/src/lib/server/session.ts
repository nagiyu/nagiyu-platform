import { auth } from '@/auth';
import { createSessionGetter } from '@nagiyu/nextjs';
import type { Session } from '@nagiyu/common';

/**
 * セッション情報を取得する関数。
 *
 * - Auth サービスから発行された JWT を検証する
 * - `SKIP_AUTH_CHECK=true` の場合はテスト用モックセッションを返す（dev / E2E 向け）
 * - middleware ではなく API Route 側の `withAuth` 用にも利用する
 */
export const getSession = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
  defaultRoles: ['livetalk-user'],
});
