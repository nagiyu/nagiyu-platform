import type { Session } from '@nagiyu/common';
import { getOptionalSession } from '@nagiyu/nextjs';
import { createSessionGetter } from '@nagiyu/nextjs/session';
import { auth } from '@/auth';

const getSessionFromAuth = createSessionGetter({
  auth: auth as () => Promise<Session | null>,
});

/**
 * 任意のセッションを読む。未ログインは null。
 *
 * Quick Clip は未ログインでも全機能を使えるため、AUTH_SECRET が未設定の環境や
 * 壊れた Cookie でセッションの検証が例外になっても、匿名利用として扱って落とさない。
 *
 * @returns ログイン中はセッション、未ログイン・検証不能な場合は null
 */
export async function getSession(): Promise<Session | null> {
  try {
    return await getOptionalSession(getSessionFromAuth);
  } catch {
    return null;
  }
}
