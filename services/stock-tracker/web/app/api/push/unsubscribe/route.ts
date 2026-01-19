/**
 * Web Push Unsubscribe API Endpoint
 *
 * DELETE /api/push/unsubscribe - Web Push サブスクリプション解除
 *
 * Required Permission: stocks:write-own
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthError } from '@nagiyu/stock-tracker-core';
import { getSession } from '../../../../lib/auth';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  MISSING_ENDPOINT: 'エンドポイント情報が必要です',
  INVALID_ENDPOINT: 'エンドポイント情報が不正です',
  INTERNAL_ERROR: 'サブスクリプションの解除に失敗しました',
} as const;

/**
 * レスポンス型定義
 */
interface UnsubscribeResponse {
  success: true;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * エンドポイント情報のバリデーション
 */
function validateEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    return false;
  }

  try {
    // URL コンストラクタで形式チェックを行う
    // 無効な URL の場合は例外がスローされる
    new URL(endpoint);
    return true;
  } catch {
    return false;
  }
}

/**
 * DELETE /api/push/unsubscribe
 * Web Push サブスクリプション解除
 */
export async function DELETE(
  request: NextRequest
): Promise<NextResponse<UnsubscribeResponse | ErrorResponse>> {
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

    // endpoint フィールドのチェック
    if (!body || typeof body !== 'object' || !('endpoint' in body)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.MISSING_ENDPOINT,
        },
        { status: 400 }
      );
    }

    const { endpoint } = body as { endpoint: unknown };

    // エンドポイント情報のバリデーション
    if (!validateEndpoint(endpoint)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_ENDPOINT,
        },
        { status: 400 }
      );
    }

    // Phase 1: サブスクリプション情報は Alert エンティティに保存されている
    // 実際の解除処理は Alert 削除時に行われる
    // ここでは単純に成功レスポンスを返す

    const response: UnsubscribeResponse = {
      success: true,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.INTERNAL_ERROR,
      },
      { status: 500 }
    );
  }
}
