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
import { getAuthError, validatePushSubscription, readJsonObjectBody } from '@nagiyu/nextjs';
import { createAlertRepository } from '@nagiyu/stock-tracker-core';
import { getSession } from '../../../../lib/auth';
import { createInternalErrorReporting } from '../../../../lib/api-error-reporting';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
  MISSING_SUBSCRIPTION: 'サブスクリプション情報が必要です',
  INVALID_SUBSCRIPTION: 'サブスクリプション情報が不正です',
  INTERNAL_ERROR: 'サブスクリプションの更新に失敗しました',
} as const;

const withInternalErrorReporting = createInternalErrorReporting(
  ERROR_MESSAGES.INTERNAL_ERROR,
  'Error refreshing push subscriptions:'
);

/**
 * レスポンス型定義
 */
interface RefreshResponse {
  success: true;
  updatedCount: number;
}

/**
 * POST /api/push/refresh
 * ユーザーの全アラートのサブスクリプション情報を更新
 */
export const POST = withInternalErrorReporting(
  'Web API: サブスクリプション更新エラー',
  async (request: NextRequest) => {
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
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
        },
        { status: 400 }
      );
    }

    // subscription フィールドのチェック
    if (!('subscription' in bodyResult.body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.MISSING_SUBSCRIPTION,
        },
        { status: 400 }
      );
    }

    const { subscription } = bodyResult.body;

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

    // ユーザーIDを取得
    const userId = session!.user.id;

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
        alert.subscription.endpoint !== subscription.endpoint ||
        alert.subscription.keys.p256dh !== subscription.keys.p256dh ||
        alert.subscription.keys.auth !== subscription.keys.auth
      ) {
        await alertRepo.update(userId, alert.alertId, {
          subscription: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth,
            },
          },
        });
        updatedCount++;
      }
    }

    const response: RefreshResponse = {
      success: true,
      updatedCount,
    };

    return NextResponse.json(response, { status: 200 });
  }
);
