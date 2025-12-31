import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  USER_NOT_FOUND: 'ユーザーが見つかりません',
} as const;

/**
 * GET /api/users/me - 自分のユーザー情報取得
 *
 * 現在ログイン中のユーザー情報を取得します。
 */
export async function GET() {
  // 認証チェック
  const session = await auth();

  if (!session) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.UNAUTHORIZED },
      { status: 401 }
    );
  }

  // ユーザー情報取得
  const repo = new DynamoDBUserRepository();
  const user = await repo.getUserById(session.user.id);

  if (!user) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.USER_NOT_FOUND },
      { status: 404 }
    );
  }

  return NextResponse.json(user);
}
