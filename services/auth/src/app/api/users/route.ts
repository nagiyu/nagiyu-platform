import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';
import { hasPermission } from '@nagiyu/common/auth';

const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  INVALID_LIMIT: '取得件数は1〜100の範囲で指定してください',
} as const;

export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  if (!hasPermission(session.user.roles, 'users:read')) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGES.FORBIDDEN,
        details: 'Required permission: users:read',
      },
      { status: 403 }
    );
  }

  const repo = new DynamoDBUserRepository();
  const searchParams = req.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '100');
  const nextToken = searchParams.get('nextToken');

  // バリデーション: limit は 1〜100
  if (limit < 1 || limit > 100) {
    return NextResponse.json({ error: ERROR_MESSAGES.INVALID_LIMIT }, { status: 400 });
  }

  const lastEvaluatedKey = nextToken
    ? JSON.parse(Buffer.from(nextToken, 'base64').toString())
    : undefined;

  const result = await repo.listUsers(limit, lastEvaluatedKey);

  return NextResponse.json({
    users: result.users,
    nextToken: result.lastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
      : undefined,
  });
}
