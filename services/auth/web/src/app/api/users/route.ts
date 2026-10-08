import { NextRequest, NextResponse } from 'next/server';
import { createUserRepository } from '@nagiyu/auth-core';
import { COMMON_ERROR_MESSAGES, hasPermission, toErrorMessage } from '@nagiyu/common';
import { decodeCursor, encodeCursor, reportErrorEvent } from '@nagiyu/aws';
import { PaginationValidationError, parsePagination } from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  FORBIDDEN: COMMON_ERROR_MESSAGES.FORBIDDEN,
} as const;

/**
 * GET /api/users - ユーザー一覧取得
 *
 * クエリパラメータ:
 * - limit: 取得件数 (デフォルト: 50, 1〜100)
 * - lastKey: ページネーション用キー (前回レスポンスの pagination.lastKey。不正な値は無視して先頭から取得)
 *
 * 必要な権限: users:read
 */
export async function GET(req: NextRequest) {
  // 認証チェック
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  // 権限チェック
  if (!hasPermission(session.user.roles, 'users:read')) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGES.FORBIDDEN,
        details: 'Required permission: users:read',
      },
      { status: 403 }
    );
  }

  try {
    const repo = createUserRepository();

    const { limit, cursor } = parsePagination(req);

    // ユーザー一覧を取得
    const result = await repo.listUsers(limit, decodeCursor(cursor));

    // レスポンスを返す
    return NextResponse.json({
      users: result.users,
      pagination: {
        count: result.users.length,
        lastKey: encodeCursor(result.lastEvaluatedKey),
      },
    });
  } catch (error) {
    if (error instanceof PaginationValidationError) {
      return NextResponse.json(
        {
          error: COMMON_ERROR_MESSAGES.INVALID_REQUEST_PARAMS,
          details: [{ field: 'limit', message: error.message }],
        },
        { status: 400 }
      );
    }

    const errorMessage = toErrorMessage(error);
    await reportErrorEvent({
      serviceId: 'auth',
      severity: 'error',
      title: 'Web API: ユーザー一覧取得エラー',
      message: errorMessage,
      context: { errorStack: error instanceof Error ? error.stack : undefined },
    });
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'ユーザー一覧の取得に失敗しました' }, { status: 500 });
  }
}
