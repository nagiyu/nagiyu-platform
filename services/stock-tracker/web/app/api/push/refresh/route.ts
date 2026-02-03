/**
 * Web Push Refresh API Endpoint
 *
 * POST /api/push/refresh - ユーザーの全アラートのサブスクリプション情報を更新
 *
 * ブラウザの Service Worker 再登録時やサブスクリプション更新時に呼び出し、
 * 既存アラートのサブスクリプション情報を最新のものに更新する。
 *
 * Required Permission: stocks:write-own
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthError } from '@nagiyu/stock-tracker-core';
import { createAlertRepository } from '../../../../lib/repository-factory';
import { getSession } from '../../../../lib/auth';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  MISSING_SUBSCRIPTION: 'サブスクリプション情報が必要です',
  INVALID_SUBSCRIPTION: 'サブスクリプション情報が不正です',
  INTERNAL_ERROR: 'サブスクリプションの更新に失敗しました',
} as const;

/**
 * リクエストボディ型定義
 */
interface RefreshRequest {
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
interface RefreshResponse {
  success: true;
  updatedCount: number;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * サブスクリプション情報のバリデーション
 */
function validateSubscription(
  subscription: unknown
): subscription is RefreshRequest['subscription'] {
  if (!subscription || typeof subscription !== 'object') {
    return false;
  }

  const sub = subscription as Record<string, unknown>;

  if (typeof sub.endpoint !== 'string' || !sub.endpoint) {
    return false;
  }

  // endpoint が有効な URL 形式であることを検証
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
 * POST /api/push/refresh
 * ユーザーの全アラートのサブスクリプション情報を更新
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<RefreshResponse | ErrorResponse>> {
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

    // ユーザーIDを取得
    const userId = session!.user.userId;

    // リポジトリの初期化
    const alertRepo = createAlertRepository();

    // ユーザーの全アラートを取得
    const result = await alertRepo.getByUserId(userId, { limit: 100 });
    const alerts = result.items;

    // 各アラートのサブスクリプション情報を更新
    let updatedCount = 0;
    for (const alert of alerts) {
      // 現在のサブスクリプションと異なる場合のみ更新
      if (
        alert.SubscriptionEndpoint !== subscription.endpoint ||
        alert.SubscriptionKeysP256dh !== subscription.keys.p256dh ||
        alert.SubscriptionKeysAuth !== subscription.keys.auth
      ) {
        await alertRepo.update(userId, alert.AlertID, {
          SubscriptionEndpoint: subscription.endpoint,
          SubscriptionKeysP256dh: subscription.keys.p256dh,
          SubscriptionKeysAuth: subscription.keys.auth,
        });
        updatedCount++;
      }
    }

    const response: RefreshResponse = {
      success: true,
      updatedCount,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error refreshing push subscriptions:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.INTERNAL_ERROR,
      },
      { status: 500 }
    );
  }
}
