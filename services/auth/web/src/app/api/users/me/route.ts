import { NextResponse } from 'next/server';
import { auth, DynamoDBUserRepository } from '@nagiyu/auth-core';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  USER_NOT_FOUND: 'ユーザーが見つかりません',
} as const;

/**
 * GET /api/users/me - 自分のユーザー情報取得
 *
 * 認証されたユーザー自身の情報を返す
 * 権限チェックは不要（自分自身の情報を取得するため）
 */
export async function GET() {
  // 認証チェック
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  try {
    const repo = new DynamoDBUserRepository();
    const user = await repo.getUserById(session.user.id);

    if (!user) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching current user:', error);
    return NextResponse.json({ error: 'ユーザー情報の取得に失敗しました' }, { status: 500 });
  }
}
