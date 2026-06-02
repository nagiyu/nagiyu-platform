/**
 * GET /api/push/first-word — 未消化の最新通知を返す。
 *
 * 起動時にキャラ第一声として表示する通知本文を返す。
 * 未消化（ConsumedAt 未設定）の最新 NotificationEvent が対象。
 * なければ 204 を返す。
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { getNotificationEventRepository } from '@/lib/server/repositories';

export const GET = withAuth(getSession, 'livetalk:chat', async (session) => {
  const userId = session.user.googleId;
  const repo = getNotificationEventRepository();
  const events = await repo.listByUser(userId, 20);

  const unconsumed = events.find((e) => e.ConsumedAt === undefined);
  if (!unconsumed) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ notifId: unconsumed.NotifID, body: unconsumed.Body }, { status: 200 });
});
