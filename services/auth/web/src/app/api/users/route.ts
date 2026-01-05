import { NextRequest, NextResponse } from 'next/server';
import { auth, DynamoDBUserRepository } from '@nagiyu/auth-core';
import { hasPermission } from '@nagiyu/common';

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

    // クエリパラメータの取得
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 100);
    const nextToken = searchParams.get('nextToken');

    // nextToken をデコード
    const lastEvaluatedKey = nextToken
      ? JSON.parse(Buffer.from(nextToken, 'base64').toString())
      : undefined;

    // ユーザー一覧を取得
    const result = await repo.listUsers(limit, lastEvaluatedKey);

    // レスポンスを返す
    return NextResponse.json({
      users: result.users,
      nextToken: result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : undefined,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'ユーザー一覧の取得に失敗しました' }, { status: 500 });
  }
}
