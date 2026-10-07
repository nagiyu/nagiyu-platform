import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSubscriptionId } from '@nagiyu/common';
import type { Permission, PushSubscription } from '@nagiyu/common';
import { getAuthError } from './auth.js';
import type { AuthFunction, SessionWithRoles } from './auth.js';

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

/**
 * Push サブスクリプション情報を検証する。
 *
 * endpoint が有効な URL 形式であり、keys.p256dh と keys.auth が
 * 非空文字列で存在する場合に true を返す。
 */
export function validatePushSubscription(subscription: unknown): subscription is PushSubscription {
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

export interface CreatePushSubscribeRouteOptions<
  TSession extends SessionWithRoles = SessionWithRoles,
> {
  getSession: AuthFunction<TSession>;
  requiredPermission?: Permission;
  /**
   * 検証済みの購読を保存するフック。
   * 201 を返す直前に呼ばれ、例外は 500 として扱われる。
   */
  onSubscribe?: (params: {
    session: TSession;
    subscription: PushSubscription;
    subscriptionId: string;
  }) => Promise<void>;
}

export function createPushSubscribeRoute<TSession extends SessionWithRoles = SessionWithRoles>(
  options: CreatePushSubscribeRouteOptions<TSession>
) {
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

      if (options.onSubscribe) {
        // authError が null なので session は非 null
        await options.onSubscribe({ session: session as TSession, subscription, subscriptionId });
      }

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

export { createSubscriptionId };
