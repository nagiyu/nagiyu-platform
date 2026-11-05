import { NextRequest, NextResponse } from 'next/server';
import {
  BILLING_ERROR_MESSAGES,
  createBillingStripe,
  createPlanChangeSession,
  createUserRepository,
  getBillingConfig,
} from '@nagiyu/auth-core';
import { COMMON_ERROR_MESSAGES, PAID_ROLES } from '@nagiyu/common';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { buildCheckoutUrls } from '@/lib/billing-urls';
import { sanitizeCallbackUrl } from '@/lib/callback-url';
import { resolveBaseUrl } from '@/lib/signout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ERROR_MESSAGES = {
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  USER_NOT_FOUND: COMMON_ERROR_MESSAGES.USER_NOT_FOUND,
  BILLING_DISABLED: BILLING_ERROR_MESSAGES.BILLING_DISABLED,
  INVALID_BODY: 'リクエストの内容が正しくありません',
  INVALID_ROLE: '切り替えられないプランです',
  NOT_SUBSCRIBED: 'このサービスは契約していません',
  SAME_PLAN: '既にこのプランを契約中です',
  CANCELING: '解約を予約中のため切り替えられません。解約の取り消しは「契約を管理」から行えます',
  CHANGE_SCHEDULED: '変更を予約中のため切り替えられません。先に予約を取り消してください',
  PRICE_NOT_FOUND: 'プランの価格を取得できませんでした',
  PLAN_CHANGE_FAILED: 'プランの切り替えの準備に失敗しました',
} as const;

/** POST /api/billing/plan-change - 段の切り替え確認画面 (Customer Portal) の URL を返す */
export const POST = withApiErrorReporting(
  'Web API: プランの切り替えの準備エラー',
  async (request: NextRequest) => {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    const config = getBillingConfig();
    if (!config) {
      return NextResponse.json({ error: ERROR_MESSAGES.BILLING_DISABLED }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    if (typeof body?.roleId !== 'string' || !PAID_ROLES.includes(body.roleId)) {
      return NextResponse.json({ error: ERROR_MESSAGES.INVALID_ROLE }, { status: 400 });
    }
    if (body.callbackUrl !== undefined && typeof body.callbackUrl !== 'string') {
      return NextResponse.json({ error: ERROR_MESSAGES.INVALID_BODY }, { status: 400 });
    }

    const user = await createUserRepository().getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    // 確認を終えた後は申し込みの成功時と同じく、同期してからロールを取り直す経路へ送る
    const baseUrl = resolveBaseUrl(request.headers);
    const { successUrl, cancelUrl } = buildCheckoutUrls(
      baseUrl,
      sanitizeCallbackUrl(body.callbackUrl, baseUrl)
    );
    const result = await createPlanChangeSession(
      createBillingStripe(config.secretKey),
      user,
      body.roleId,
      { returnUrl: cancelUrl, completionUrl: successUrl }
    );

    if (result.ok) {
      return NextResponse.json({ url: result.url });
    }
    switch (result.reason) {
      case 'invalid-role':
        return NextResponse.json({ error: ERROR_MESSAGES.INVALID_ROLE }, { status: 400 });
      case 'not-subscribed':
        return NextResponse.json({ error: ERROR_MESSAGES.NOT_SUBSCRIBED }, { status: 409 });
      case 'same-plan':
        return NextResponse.json({ error: ERROR_MESSAGES.SAME_PLAN }, { status: 409 });
      case 'canceling':
        return NextResponse.json({ error: ERROR_MESSAGES.CANCELING }, { status: 409 });
      case 'change-scheduled':
        return NextResponse.json({ error: ERROR_MESSAGES.CHANGE_SCHEDULED }, { status: 409 });
      case 'price-not-found':
        return NextResponse.json({ error: ERROR_MESSAGES.PRICE_NOT_FOUND }, { status: 503 });
    }
  },
  ERROR_MESSAGES.PLAN_CHANGE_FAILED
);
