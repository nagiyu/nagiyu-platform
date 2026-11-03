import { NextRequest, NextResponse } from 'next/server';
import {
  BILLING_ERROR_MESSAGES,
  createBillingStripe,
  createUserRepository,
  extractCustomerId,
  getBillingConfig,
  syncStripeCustomer,
} from '@nagiyu/auth-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';

// 署名の検証に加工していない本文が要る。クライアントの変換や静的化を避けるため Node.js で動かす
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ERROR_MESSAGES = {
  ...BILLING_ERROR_MESSAGES,
  MISSING_SIGNATURE: 'Stripe-Signature ヘッダーがありません',
  WEBHOOK_FAILED: '通知の処理に失敗しました',
} as const;

/**
 * POST /api/billing/webhook - Stripe からの通知を受ける
 *
 * ログインではなく Stripe の署名で守る。通知は「この顧客の何かが変わった」という合図としてだけ使い、
 * 顧客の最新の状態を Stripe から取り直して権利に反映する。同期が失敗したときは 500 を返し、Stripe に再送させる。
 */
export const POST = withApiErrorReporting(
  'Web API: Stripe 通知の処理エラー',
  async (request: NextRequest) => {
    const config = getBillingConfig();
    if (!config) {
      return NextResponse.json({ error: ERROR_MESSAGES.BILLING_DISABLED }, { status: 503 });
    }

    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ error: ERROR_MESSAGES.MISSING_SIGNATURE }, { status: 400 });
    }

    const stripe = createBillingStripe(config.secretKey);
    const body = await request.text();

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret);
    } catch {
      return NextResponse.json({ error: ERROR_MESSAGES.INVALID_SIGNATURE }, { status: 400 });
    }

    const customerId = extractCustomerId(event);
    if (!customerId) {
      return NextResponse.json({ received: true, ignored: true });
    }

    await syncStripeCustomer({ stripe, userRepository: createUserRepository() }, customerId);
    return NextResponse.json({ received: true });
  },
  ERROR_MESSAGES.WEBHOOK_FAILED
);
