import { NextResponse } from 'next/server';

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

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Push サブスクリプション情報を検証する。
 *
 * endpoint が有効な URL 形式であり、keys.p256dh と keys.auth が
 * 非空文字列で存在する場合に true を返す。
 */
export function validatePushSubscription(subscription: unknown): subscription is PushSubscriptionData {
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
