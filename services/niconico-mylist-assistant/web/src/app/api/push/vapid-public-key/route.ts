/**
 * VAPID Public Key API Endpoint
 *
 * GET /api/push/vapid-public-key - VAPID公開鍵を取得
 *
 * このエンドポイントは認証不要（公開鍵なので）
 */

import { NextResponse } from 'next/server';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  MISSING_VAPID_KEY: 'VAPID公開鍵が設定されていません',
} as const;

/**
 * レスポンス型定義
 */
interface VapidPublicKeyResponse {
  publicKey: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * GET /api/push/vapid-public-key
 * VAPID公開鍵を取得
 */
export async function GET(): Promise<NextResponse<VapidPublicKeyResponse | ErrorResponse>> {
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
        message: 'VAPID公開鍵の取得中にエラーが発生しました',
      },
      { status: 500 }
    );
  }
}
