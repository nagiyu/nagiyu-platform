import { NextRequest, NextResponse } from 'next/server';
import {
  BILLING_ERROR_MESSAGES,
  cancelScheduledChange,
  createBillingStripe,
  createUserRepository,
  getBillingConfig,
} from '@nagiyu/auth-core';
import { COMMON_ERROR_MESSAGES, getBillingTierRoleIds } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ERROR_MESSAGES = {
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  USER_NOT_FOUND: COMMON_ERROR_MESSAGES.USER_NOT_FOUND,
  BILLING_DISABLED: BILLING_ERROR_MESSAGES.BILLING_DISABLED,
  INVALID_SERVICE: '取り消せない対象です',
  NO_SCHEDULED_CHANGE: '取り消せる予約がありません',
  CANCEL_FAILED: '予約の取り消しに失敗しました',
} as const;

/** POST /api/billing/scheduled-change/cancel - 下げの予約を取り消す */
export const POST = withApiErrorReporting(
  'Web API: 変更の予約の取り消しエラー',
  async (request: NextRequest) => {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    const config = getBillingConfig();
    if (!config) {
      return NextResponse.json({ error: ERROR_MESSAGES.BILLING_DISABLED }, { status: 503 });
    }

    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: ERROR_MESSAGES.INVALID_SERVICE }, { status: 400 });
    }
    const body = bodyResult.body;
    if (typeof body.serviceId !== 'string' || getBillingTierRoleIds(body.serviceId).length === 0) {
      return NextResponse.json({ error: ERROR_MESSAGES.INVALID_SERVICE }, { status: 400 });
    }

    const user = await createUserRepository().getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    const result = await cancelScheduledChange(
      createBillingStripe(config.secretKey),
      user,
      body.serviceId
    );
    if (!result.ok) {
      return NextResponse.json({ error: ERROR_MESSAGES.NO_SCHEDULED_CHANGE }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  },
  ERROR_MESSAGES.CANCEL_FAILED
);
