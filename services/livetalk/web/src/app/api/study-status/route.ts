/**
 * GET /api/study-status
 *
 * ホーム画面の札が使う、勉強の状態を返す。ログインだけを確かめる。
 * 区分はセッションの有効なロール、お試しの期間は Profile の作成時刻から決める。
 * Profile がまだない (同意前など) ときは、お試しが始まっていないため `hidden` を返す。
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { createProfileRepository } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { withApiErrorReporting } from '@/lib/server/api-error-reporting';
import { computeStudyStatus } from '@/lib/study/study-status';
import { STUDY_STATUS_ERROR_MESSAGES } from './constants';

export const GET = withApiErrorReporting(
  'Web API: 勉強の状態取得エラー',
  withAuth(getSession, null, async (session) => {
    const profile = await createProfileRepository().getById({ userId: session.user.id });
    return NextResponse.json(
      computeStudyStatus(session.user.roles, profile?.createdAt ?? null, Date.now())
    );
  }),
  { error: 'FETCH_FAILED', message: STUDY_STATUS_ERROR_MESSAGES.FETCH_FAILED }
);
