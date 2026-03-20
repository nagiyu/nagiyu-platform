import { NextResponse } from 'next/server';

const ERROR_MESSAGES = {
  MISSING_VAPID_KEY: 'VAPID 公開鍵が設定されていません',
} as const;

export async function GET(): Promise<NextResponse> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.MISSING_VAPID_KEY,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ publicKey }, { status: 200 });
}
