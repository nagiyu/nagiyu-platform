import { NextRequest, NextResponse } from 'next/server';
import {
  BILLING_ERROR_MESSAGES,
  createBillingStripe,
  createPortalSession,
  createUserRepository,
  getBillingConfig,
} from '@nagiyu/auth-core';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { buildPortalReturnUrl } from '@/lib/billing-urls';
import { sanitizeCallbackUrl } from '@/lib/callback-url';
import { resolveBaseUrl } from '@/lib/signout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ERROR_MESSAGES = {
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  USER_NOT_FOUND: COMMON_ERROR_MESSAGES.USER_NOT_FOUND,
  BILLING_DISABLED: BILLING_ERROR_MESSAGES.BILLING_DISABLED,
  INVALID_BODY: 'リクエストの内容が正しくありません',
  NO_CUSTOMER: '契約の情報がありません',
  PORTAL_FAILED: '契約の管理画面を開けませんでした',
} as const;

/** POST /api/billing/portal - Customer Portal の URL を返す */
export const POST = withApiErrorReporting(
  'Web API: 契約の管理画面の準備エラー',
  async (request: NextRequest) => {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    const config = getBillingConfig();
    if (!config) {
      return NextResponse.json({ error: ERROR_MESSAGES.BILLING_DISABLED }, { status: 503 });
    }

    // body 自体が無い呼び出しも許す。あれば callbackUrl だけを読む
    const bodyResult = await readJsonObjectBody(request);
    const body = bodyResult.ok ? bodyResult.body : {};
    if (body.callbackUrl !== undefined && typeof body.callbackUrl !== 'string') {
      return NextResponse.json({ error: ERROR_MESSAGES.INVALID_BODY }, { status: 400 });
    }

    const user = await createUserRepository().getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    const baseUrl = resolveBaseUrl(request.headers);
    const returnUrl = buildPortalReturnUrl(baseUrl, sanitizeCallbackUrl(body.callbackUrl, baseUrl));
    const result = await createPortalSession(
      createBillingStripe(config.secretKey),
      user,
      returnUrl
    );

    if (!result.ok) {
      return NextResponse.json({ error: ERROR_MESSAGES.NO_CUSTOMER }, { status: 404 });
    }
    return NextResponse.json({ url: result.url });
  },
  ERROR_MESSAGES.PORTAL_FAILED
);
