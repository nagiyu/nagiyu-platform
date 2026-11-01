/**
 * PATCH /api/push/consumed — キャラ第一声の消化済みマーク。
 *
 * 起動時に未消化の最新 NotificationEvent を第一声として表示した後、
 * クライアントがこのエンドポイントを呼び consumedAt を記録する。
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { EntityNotFoundError } from '@nagiyu/aws';
import { readJsonObjectBody, withAuth } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { withApiErrorReporting } from '@/lib/server/api-error-reporting';
import { createNotificationEventRepository } from '@nagiyu/livetalk-core';

const ERROR_MESSAGES = {
  MISSING_NOTIF_ID: 'notifId が必要です',
  NOT_FOUND: '指定された通知が見つかりません',
  INTERNAL_ERROR: '消化済みマークの更新に失敗しました',
} as const;

export const PATCH = withApiErrorReporting(
  'Web API: 通知消化済みマークエラー',
  withAuth(getSession, 'livetalk:chat', async (session, request: NextRequest) => {
    const bodyResult = await readJsonObjectBody(request);
    const notifId = bodyResult.ok ? bodyResult.body.notifId : undefined;
    if (typeof notifId !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.MISSING_NOTIF_ID },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    const repo = createNotificationEventRepository();
    try {
      await repo.markConsumed({ userId, notifId }, Date.now());
    } catch (error) {
      // 存在しない通知を欠けたアイテムとして作らないよう、更新対象なしは 404 で返す
      if (error instanceof EntityNotFoundError) {
        return NextResponse.json(
          { error: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true }, { status: 200 });
  })
);
