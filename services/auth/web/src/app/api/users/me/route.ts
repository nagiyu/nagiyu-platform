import { NextResponse } from 'next/server';
import { createUserRepository } from '@nagiyu/auth-core';
import { COMMON_ERROR_MESSAGES, toErrorMessage } from '@nagiyu/common';
import { reportErrorEvent } from '@nagiyu/aws';
import { getSession } from '@/lib/auth/session';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  USER_NOT_FOUND: COMMON_ERROR_MESSAGES.USER_NOT_FOUND,
} as const;

/**
 * GET /api/users/me - 自分のユーザー情報取得
 *
 * 認証されたユーザー自身の情報を返す
 * 権限チェックは不要（自分自身の情報を取得するため）
 */
export async function GET() {
  // 認証チェック
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  try {
    const repo = createUserRepository();
    const user = await repo.getUserById(session.user.id);

    if (!user) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    await reportErrorEvent({
      serviceId: 'auth',
      severity: 'error',
      title: 'Web API: 自分のユーザー情報取得エラー',
      message: errorMessage,
      context: {
        userId: session.user.id,
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });
    console.error('Error fetching current user:', error);
    return NextResponse.json({ error: 'ユーザー情報の取得に失敗しました' }, { status: 500 });
  }
}
