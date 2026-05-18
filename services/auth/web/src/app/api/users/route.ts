import { NextRequest, NextResponse } from 'next/server';
import { createUserRepository } from '@nagiyu/auth-core';
import { COMMON_ERROR_MESSAGES, hasPermission } from '@nagiyu/common';
import { reportErrorEvent } from '@nagiyu/aws';
import { ListUsersQuerySchema } from './schemas';
import { ZodError } from 'zod';
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
 * - limit: 取得件数 (デフォルト: 100, 最大: 100)
 * - nextToken: ページネーション用キー (base64エンコード)
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
    const searchParams = req.nextUrl.searchParams;

    // クエリパラメータのバリデーション
    const validatedQuery = ListUsersQuerySchema.parse({
      limit: searchParams.get('limit') || undefined,
      nextToken: searchParams.get('nextToken') || undefined,
    });

    // nextToken をデコード
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    if (validatedQuery.nextToken) {
      try {
        const decoded = Buffer.from(validatedQuery.nextToken, 'base64').toString();
        lastEvaluatedKey = JSON.parse(decoded);
      } catch {
        return NextResponse.json({ error: 'nextToken の形式が不正です' }, { status: 400 });
      }
    }

    // ユーザー一覧を取得
    const result = await repo.listUsers(validatedQuery.limit, lastEvaluatedKey);

    // レスポンスを返す
    return NextResponse.json({
      users: result.users,
      nextToken: result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : undefined,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: COMMON_ERROR_MESSAGES.INVALID_REQUEST_PARAMS,
          details: error.issues.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
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
