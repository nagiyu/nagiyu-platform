import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBUserRepository, UserNotFoundError } from '@nagiyu/auth-core';
import { hasPermission, VALID_ROLES } from '@nagiyu/common';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  USER_NOT_FOUND: 'ユーザーが見つかりません',
  INVALID_ROLES: '無効なロールが含まれています',
} as const;

// ロール割り当てリクエストのバリデーションスキーマ
const AssignRolesSchema = z.object({
  roles: z.array(z.string()).min(0, 'roles は配列である必要があります'),
});

/**
 * POST /api/users/[userId]/roles - ロール割り当て
 *
 * リクエストボディ:
 * - roles: string[] - 割り当てるロールID配列
 *
 * 必要な権限: roles:assign
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  // 認証チェック
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  // 権限チェック
  if (!hasPermission(session.user.roles, 'roles:assign')) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGES.FORBIDDEN,
        details: 'Required permission: roles:assign',
      },
      { status: 403 }
    );
  }

  try {
    const { userId } = await params;
    const body = await req.json();

    // リクエストボディのバリデーション
    const validatedData = AssignRolesSchema.parse(body);
    const { roles } = validatedData;

    // ロールの妥当性チェック
    const invalidRoles = roles.filter((role) => !VALID_ROLES.includes(role));
    if (invalidRoles.length > 0) {
      return NextResponse.json(
        {
          error: `${ERROR_MESSAGES.INVALID_ROLES}: ${invalidRoles.join(', ')}`,
          validRoles: VALID_ROLES,
        },
        { status: 400 }
      );
    }

    const repo = new DynamoDBUserRepository();

    // ロールを割り当て
    const updatedUser = await repo.assignRoles(userId, roles);

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'リクエストボディが不正です',
          details: error.issues.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    // リポジトリ層からのユーザー不存在エラー
    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    console.error('Error assigning roles:', error);
    return NextResponse.json({ error: 'ロールの割り当てに失敗しました' }, { status: 500 });
  }
}
