/**
 * POST /api/push/subscribe — Web Push サブスクリプション登録。
 *
 * 既存の `createPushSubscribeRoute` ファクトリは検証のみで DynamoDB 保存をしないため、
 * リブトーク固有のカスタム実装として subscription を USER# 配下に保存する。
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { validatePushSubscription, createSubscriptionId } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { getPushSubscriptionRepository } from '@/lib/server/repositories';

const ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  MISSING_SUBSCRIPTION: 'サブスクリプション情報が必要です',
  INVALID_SUBSCRIPTION: 'サブスクリプション情報が不正です',
  INTERNAL_ERROR: 'サブスクリプションの登録に失敗しました',
} as const;

export const POST = withAuth(
  getSession,
  'livetalk:chat',
  async (session, request: NextRequest) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.INVALID_REQUEST_BODY },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object' || !('subscription' in body)) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.MISSING_SUBSCRIPTION },
        { status: 400 }
      );
    }

    const { subscription } = body as { subscription: unknown };
    if (!validatePushSubscription(subscription)) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.INVALID_SUBSCRIPTION },
        { status: 400 }
      );
    }

    const subscriptionId = await createSubscriptionId(subscription.endpoint);
    const userId = session.user.id;

    const repo = getPushSubscriptionRepository();
    await repo.put({
      UserID: userId,
      SubscriptionID: subscriptionId,
      Endpoint: subscription.endpoint,
      P256dhKey: subscription.keys.p256dh,
      AuthKey: subscription.keys.auth,
    });

    return NextResponse.json({ success: true, subscriptionId }, { status: 201 });
  }
);
