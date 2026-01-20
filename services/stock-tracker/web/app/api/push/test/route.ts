/**
 * Web Push Test API Endpoint (開発用)
 *
 * POST /api/push/test - テスト通知を送信
 *
 * 現在のブラウザのサブスクリプションに対してテスト通知を送信する。
 * web-push ライブラリを使用して WNS/FCM 経由で配信されるため、
 * 実際のプッシュ通知パイプラインをテストできる。
 *
 * Required Permission: stocks:write-own
 */

import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getAuthError } from '@nagiyu/stock-tracker-core';
import { getSession } from '../../../../lib/auth';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  MISSING_SUBSCRIPTION: 'サブスクリプション情報が必要です',
  INVALID_SUBSCRIPTION: 'サブスクリプション情報が不正です',
  MISSING_VAPID_KEYS: 'VAPID キーが設定されていません',
  SEND_FAILED: 'テスト通知の送信に失敗しました',
} as const;

/**
 * VAPID キーの初期化
 */
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails('mailto:noreply@nagiyu.com', vapidPublicKey, vapidPrivateKey);
}

/**
 * リクエストボディ型定義
 */
interface TestRequest {
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}

/**
 * レスポンス型定義
 */
interface TestResponse {
  success: true;
  statusCode: number;
  endpoint: string;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: string;
}

/**
 * サブスクリプション情報のバリデーション
 */
function validateSubscription(
  subscription: unknown
): subscription is TestRequest['subscription'] {
  if (!subscription || typeof subscription !== 'object') {
    return false;
  }

  const sub = subscription as Record<string, unknown>;

  if (typeof sub.endpoint !== 'string' || !sub.endpoint) {
    return false;
  }

  try {
    new URL(sub.endpoint);
  } catch {
    return false;
  }

  if (!sub.keys || typeof sub.keys !== 'object') {
    return false;
  }

  const keys = sub.keys as Record<string, unknown>;

  if (typeof keys.p256dh !== 'string' || !keys.p256dh) {
    return false;
  }

  if (typeof keys.auth !== 'string' || !keys.auth) {
    return false;
  }

  return true;
}

/**
 * POST /api/push/test
 * テスト通知を送信
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<TestResponse | ErrorResponse>> {
  try {
    // 認証・権限チェック
    const session = await getSession();
    const authError = getAuthError(session, 'stocks:write-own');

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
    if (!validateSubscription(subscription)) {
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

    // テスト通知のペイロード
    const payload = JSON.stringify({
      title: 'Stock Tracker テスト',
      body: `テスト通知です（${new Date().toLocaleTimeString('ja-JP')}）`,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: 'test-notification',
      data: {
        url: '/alerts',
      },
    });

    // web-push で送信
    const response = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      payload
    );

    console.log('Test notification sent:', {
      statusCode: response.statusCode,
      endpoint: subscription.endpoint,
    });

    return NextResponse.json(
      {
        success: true,
        statusCode: response.statusCode,
        endpoint: subscription.endpoint,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error sending test notification:', errorMessage);
    return NextResponse.json(
      {
        error: 'SEND_FAILED',
        message: ERROR_MESSAGES.SEND_FAILED,
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
