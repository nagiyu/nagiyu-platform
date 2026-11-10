import { NextRequest, NextResponse } from 'next/server';
import {
  BILLING_ERROR_MESSAGES,
  canStartCheckout,
  createBillingStripe,
  createCheckoutSession,
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
  CHECKOUT_RESTRICTED: 'この環境では、テスト用のロールを持つ人だけが申し込めます',
  INVALID_BODY: 'リクエストの内容が正しくありません',
  INVALID_ROLE: '申し込めないプランです',
  ALREADY_SUBSCRIBED_IN_SERVICE: 'このサービスは既に契約中です。段の変更はプランの画面から行えます',
  PRICE_NOT_FOUND: 'プランの価格を取得できませんでした',
  CHECKOUT_FAILED: '申し込みの準備に失敗しました',
} as const;

/** POST /api/billing/checkout - 申し込みの Checkout Session の URL を返す */
export const POST = withApiErrorReporting(
  'Web API: 申し込みの準備エラー',
  async (request: NextRequest) => {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    // 決済画面を作る前に断る。Stripe に顧客や Session を作らせないため
    if (!canStartCheckout(process.env.NAGIYU_ENV, session.user.roles)) {
      return NextResponse.json({ error: ERROR_MESSAGES.CHECKOUT_RESTRICTED }, { status: 403 });
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

    const userRepository = createUserRepository();
    const user = await userRepository.getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    const baseUrl = resolveBaseUrl(request.headers);
    const urls = buildCheckoutUrls(baseUrl, sanitizeCallbackUrl(body.callbackUrl, baseUrl));
    const result = await createCheckoutSession(
      { stripe: createBillingStripe(config.secretKey), userRepository },
      user,
      body.roleId,
      urls
    );

    if (result.ok) {
      return NextResponse.json({ url: result.url });
    }
    switch (result.reason) {
      case 'invalid-role':
        return NextResponse.json({ error: ERROR_MESSAGES.INVALID_ROLE }, { status: 400 });
      case 'already-subscribed-in-service':
        return NextResponse.json(
          { error: ERROR_MESSAGES.ALREADY_SUBSCRIBED_IN_SERVICE },
          { status: 409 }
        );
      case 'price-not-found':
        return NextResponse.json({ error: ERROR_MESSAGES.PRICE_NOT_FOUND }, { status: 503 });
    }
  },
  ERROR_MESSAGES.CHECKOUT_FAILED
);
