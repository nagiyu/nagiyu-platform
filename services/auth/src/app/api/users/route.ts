import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';
import { hasPermission } from '@nagiyu/common/auth';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  INVALID_LIMIT: '取得件数は1から100の範囲で指定してください',
} as const;

/**
 * GET /api/users - ユーザー一覧取得
 *
 * 登録されている全ユーザーを取得します。
 * 必要な権限: users:read
 */
export async function GET(req: NextRequest) {
  // 認証チェック
  const session = await auth();

  if (!session) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.UNAUTHORIZED },
      { status: 401 }
    );
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

  // クエリパラメータの取得
  const searchParams = req.nextUrl.searchParams;
  const limitParam = searchParams.get('limit');
  const nextToken = searchParams.get('nextToken');

  // limit のバリデーション
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.INVALID_LIMIT },
      { status: 400 }
    );
  }

  // lastEvaluatedKey のデコード
  const lastEvaluatedKey = nextToken
    ? JSON.parse(Buffer.from(nextToken, 'base64').toString())
    : undefined;

  // ユーザー一覧取得
  const repo = new DynamoDBUserRepository();
  const result = await repo.listUsers(limit, lastEvaluatedKey);

  // nextToken のエンコード
  const responseNextToken = result.lastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
    : undefined;

  return NextResponse.json({
    users: result.users,
    pagination: {
      count: result.users.length,
      nextToken: responseNextToken,
    },
  });
}
