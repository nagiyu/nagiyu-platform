/**
 * PATCH /api/push/consumed — キャラ第一声の消化済みマーク。
 *
 * 起動時に未消化の最新 NotificationEvent を第一声として表示した後、
 * クライアントがこのエンドポイントを呼び ConsumedAt を記録する。
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { getNotificationEventRepository } from '@/lib/server/repositories';

const ERROR_MESSAGES = {
  MISSING_NOTIF_ID: 'notifId が必要です',
  INTERNAL_ERROR: '消化済みマークの更新に失敗しました',
} as const;

export const PATCH = withAuth(
  getSession,
  'livetalk:chat',
  async (session, request: NextRequest) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.MISSING_NOTIF_ID },
        { status: 400 }
      );
    }

    if (
      !body ||
      typeof body !== 'object' ||
      !('notifId' in body) ||
      typeof (body as { notifId: unknown }).notifId !== 'string'
    ) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.MISSING_NOTIF_ID },
        { status: 400 }
      );
    }

    const { notifId } = body as { notifId: string };
    const userId = session.user.id;

    const repo = getNotificationEventRepository();
    await repo.markConsumed({ userId, notifId }, Date.now());

    return NextResponse.json({ success: true }, { status: 200 });
  }
);
