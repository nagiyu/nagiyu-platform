import { NextRequest, NextResponse } from 'next/server';
import { auth, DynamoDBUserRepository } from '@nagiyu/auth-core';
import { hasPermission } from '@nagiyu/common';
import { ListUsersQuerySchema } from './schemas';
import { ZodError } from 'zod';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
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
  const session = await auth();

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
    const repo = new DynamoDBUserRepository();
    const searchParams = req.nextUrl.searchParams;

    // クエリパラメータのバリデーション
    const validatedQuery = ListUsersQuerySchema.parse({
      limit: searchParams.get('limit'),
      nextToken: searchParams.get('nextToken'),
    });

    // nextToken をデコード
    const lastEvaluatedKey = validatedQuery.nextToken
      ? JSON.parse(Buffer.from(validatedQuery.nextToken, 'base64').toString())
      : undefined;

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
          error: 'リクエストパラメータが不正です',
          details: error.issues.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'ユーザー一覧の取得に失敗しました' }, { status: 500 });
  }
}
