import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import {
  DEFAULT_CHARACTER_ID,
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
  resolveLifecycleState,
} from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getLifecycleRepository } from '@/lib/server/repositories';

/**
 * GET /api/lifecycle
 *
 * 現在のユーザー × キャラの生活サイクル状態（awake / sleeping）を返す（Phase 4b / Issue #3335）。
 *
 * フロントは初回起動時にこの値を取得し、初回発話を待たずに Live2D の目パラメータへ
 * 反映する。チャットストリーム（/api/chat）の lifecycle event とは別系統の
 * 「初期状態取得用」エンドポイント。
 *
 * レスポンス: `{ "state": "awake" | "sleeping" }`
 *
 * 演出のための情報なので、取得失敗時も 500 を返さず fail-safe で `awake` を返し、
 * UI を止めない。
 */
export const GET = withAuth(getSession, 'livetalk:chat', async (session) => {
  const userId = session.user.googleId;

  try {
    const lifecycle = await getLifecycleRepository().get({
      userId,
      characterId: DEFAULT_CHARACTER_ID,
    });
    const state = resolveLifecycleState(
      new Date(),
      lifecycle?.Bedtime ?? LIFECYCLE_DEFAULT_BEDTIME,
      lifecycle?.WakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME
    );
    return NextResponse.json({ state });
  } catch (error) {
    // fail-safe: 演出のための情報なので UI を止めず awake を返す
    console.error('[GET /api/lifecycle] 生活サイクル状態の取得に失敗しました', error);
    return NextResponse.json({ state: 'awake' });
  }
});
