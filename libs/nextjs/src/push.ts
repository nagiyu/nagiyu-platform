import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Permission, PushSubscription } from '@nagiyu/common';
import { getAuthError } from './auth.js';
import type { AuthFunction } from './auth.js';

const ERROR_MESSAGES = {
  MISSING_VAPID_KEY: 'VAPID公開鍵が設定されていません',
} as const;

type VapidPublicKeyResponse = {
  publicKey: string;
};

type ErrorResponse = {
  error: string;
  message: string;
};

export type PushSubscriptionData = PushSubscription;

/**
 * Push サブスクリプション情報を検証する。
 *
 * endpoint が有効な URL 形式であり、keys.p256dh と keys.auth が
 * 非空文字列で存在する場合に true を返す。
 */
export function validatePushSubscription(
  subscription: unknown
): subscription is PushSubscriptionData {
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
 * Push サブスクリプション endpoint から一意なIDを生成する。
 *
 * SHA-256 ハッシュを作成し、先頭32文字を `sub_` プレフィックス付きで返す。
 * この関数は `validatePushSubscription()` で endpoint が検証済みであることを前提とする。
 */
export async function createSubscriptionId(endpoint: string): Promise<string> {
  const endpointBytes = new TextEncoder().encode(endpoint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', endpointBytes);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return `sub_${hashHex.substring(0, 32)}`;
}

/**
 * サービス共通の VAPID 公開鍵 route ハンドラーを生成する。
 */
export function createVapidPublicKeyRoute() {
  return async function GET(): Promise<NextResponse<VapidPublicKeyResponse | ErrorResponse>> {
    try {
      const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;

      if (!vapidPublicKey) {
        console.error('VAPID_PUBLIC_KEY is not configured');
        return NextResponse.json(
          {
            error: 'INTERNAL_ERROR',
            message: ERROR_MESSAGES.MISSING_VAPID_KEY,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          publicKey: vapidPublicKey,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error('Error getting VAPID public key:', error);
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: ERROR_MESSAGES.MISSING_VAPID_KEY,
        },
        { status: 500 }
      );
    }
  };
}

const SUBSCRIBE_ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  MISSING_SUBSCRIPTION: 'サブスクリプション情報が必要です',
  INVALID_SUBSCRIPTION: 'サブスクリプション情報が不正です',
  MISSING_VAPID_KEYS: 'VAPID キーが設定されていません',
  INTERNAL_ERROR: 'サブスクリプションの登録に失敗しました',
} as const;

type SubscribeResponse = {
  success: true;
  subscriptionId: string;
};

type SubscribeErrorResponse = {
  error: string;
  message: string;
};

export interface CreatePushSubscribeRouteOptions {
  getSession: AuthFunction;
  requiredPermission?: Permission;
}

export function createPushSubscribeRoute(options: CreatePushSubscribeRouteOptions) {
  return async function POST(
    request: NextRequest
  ): Promise<NextResponse<SubscribeResponse | SubscribeErrorResponse>> {
    try {
      const session = await options.getSession();
      const authError = getAuthError(session, options.requiredPermission ?? null);

      if (authError) {
        return NextResponse.json(
          {
            error: authError.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
            message: authError.message,
          },
          { status: authError.statusCode }
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: SUBSCRIBE_ERROR_MESSAGES.INVALID_REQUEST_BODY,
          },
          { status: 400 }
        );
      }

      if (!body || typeof body !== 'object' || !('subscription' in body)) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: SUBSCRIBE_ERROR_MESSAGES.MISSING_SUBSCRIPTION,
          },
          { status: 400 }
        );
      }

      const { subscription } = body as { subscription: unknown };
      if (!validatePushSubscription(subscription)) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: SUBSCRIBE_ERROR_MESSAGES.INVALID_SUBSCRIPTION,
          },
          { status: 400 }
        );
      }

      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.error('VAPID keys are not configured');
        return NextResponse.json(
          {
            error: 'INTERNAL_ERROR',
            message: SUBSCRIBE_ERROR_MESSAGES.MISSING_VAPID_KEYS,
          },
          { status: 500 }
        );
      }

      const subscriptionId = await createSubscriptionId(subscription.endpoint);

      return NextResponse.json(
        {
          success: true,
          subscriptionId,
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: SUBSCRIBE_ERROR_MESSAGES.INTERNAL_ERROR,
        },
        { status: 500 }
      );
    }
  };
}
