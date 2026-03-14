/**
 * Web Push Subscribe API Endpoint
 *
 * POST /api/push/subscribe - Web Push サブスクリプション登録
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthError, validatePushSubscription, createSubscriptionId } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth/session';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  MISSING_SUBSCRIPTION: 'サブスクリプション情報が必要です',
  INVALID_SUBSCRIPTION: 'サブスクリプション情報が不正です',
  MISSING_VAPID_KEYS: 'VAPID キーが設定されていません',
  INTERNAL_ERROR: 'サブスクリプションの登録に失敗しました',
} as const;

/**
 * VAPID キーの存在確認（モジュールレベル）
 * ここでは設定は行わず、キーの存在のみをチェック
 */
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

/**
 * レスポンス型定義
 */
interface SubscribeResponse {
  success: true;
  subscriptionId: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * POST /api/push/subscribe
 * Web Push サブスクリプション登録
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<SubscribeResponse | ErrorResponse>> {
  try {
    // 認証チェック
    const session = await getSession();
    const authError = getAuthError(session);

    if (authError) {
      return NextResponse.json(
        {
          error: authError.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message: authError.message,
        },
        { status: authError.statusCode }
      );
    }

    // リクエストボディの取得
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
        },
        { status: 400 }
      );
    }

    // subscription フィールドのチェック
    if (!body || typeof body !== 'object' || !('subscription' in body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.MISSING_SUBSCRIPTION,
        },
        { status: 400 }
      );
    }

    const { subscription } = body as { subscription: unknown };

    // サブスクリプション情報のバリデーション
    if (!validatePushSubscription(subscription)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_SUBSCRIPTION,
        },
        { status: 400 }
      );
    }

    // VAPID キーの存在確認
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys are not configured');
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: ERROR_MESSAGES.MISSING_VAPID_KEYS,
        },
        { status: 500 }
      );
    }

    // サブスクリプションIDの生成（endpoint をSHA-256でハッシュ化）
    const subscriptionId = await createSubscriptionId(subscription.endpoint);

    // サブスクリプション情報はバッチジョブ作成時に保存される
    // ここでは単純に成功レスポンスを返す

    const response: SubscribeResponse = {
      success: true,
      subscriptionId,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.INTERNAL_ERROR,
      },
      { status: 500 }
    );
  }
}
