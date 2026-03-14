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
