import { NextResponse } from 'next/server';
import { createUserRepository } from '@nagiyu/auth-core';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  USER_NOT_FOUND: COMMON_ERROR_MESSAGES.USER_NOT_FOUND,
  FETCH_USER_FAILED: 'ユーザー情報の取得に失敗しました',
} as const;

/**
 * GET /api/users/me - 自分のユーザー情報取得
 *
 * 認証されたユーザー自身の情報を返す
 * 権限チェックは不要（自分自身の情報を取得するため）
 */
export const GET = withApiErrorReporting(
  'Web API: 自分のユーザー情報取得エラー',
  async () => {
    // 認証チェック
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    const repo = createUserRepository();
    const user = await repo.getUserById(session.user.id);

    if (!user) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    return NextResponse.json(user);
  },
  ERROR_MESSAGES.FETCH_USER_FAILED
);
