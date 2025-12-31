import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';
import { hasPermission } from '@nagiyu/common/auth';
import type { UpdateUserInput } from '@/lib/db/types';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  FORBIDDEN_ROLES: 'ロールを変更する権限がありません',
  USER_NOT_FOUND: 'ユーザーが見つかりません',
  INVALID_REQUEST: 'リクエストが不正です',
  CANNOT_DELETE_SELF: '自分自身を削除することはできません',
  INVALID_NAME_LENGTH: '名前は1文字以上100文字以内で入力してください',
} as const;

/**
 * GET /api/users/[userId] - ユーザー詳細取得
 *
 * 特定ユーザーの詳細情報を取得します。
 * 必要な権限: users:read
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

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

  // ユーザー取得
  const repo = new DynamoDBUserRepository();
  const user = await repo.getUserById(userId);

  if (!user) {
    return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
  }

  return NextResponse.json(user);
}

/**
 * PATCH /api/users/[userId] - ユーザー情報更新
 *
 * ユーザーの名前やロールを更新します。
 * 必要な権限:
 * - users:write (名前更新)
 * - roles:assign (ロール変更)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  // 認証チェック
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  // 基本的な書き込み権限チェック
  if (!hasPermission(session.user.roles, 'users:write')) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGES.FORBIDDEN,
        details: 'Required permission: users:write',
      },
      { status: 403 }
    );
  }

  // リクエストボディのパース
  let body: UpdateUserInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: ERROR_MESSAGES.INVALID_REQUEST }, { status: 400 });
  }

  // ロール変更権限チェック
  if (body.roles && !hasPermission(session.user.roles, 'roles:assign')) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGES.FORBIDDEN_ROLES,
        details: 'Required permission: roles:assign',
      },
      { status: 403 }
    );
  }

  // バリデーション
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) {
      return NextResponse.json(
        {
          error: ERROR_MESSAGES.INVALID_REQUEST,
          details: { name: ERROR_MESSAGES.INVALID_NAME_LENGTH },
        },
        { status: 400 }
      );
    }
  }

  // ユーザー更新
  const repo = new DynamoDBUserRepository();
  try {
    const updatedUser = await repo.updateUser(userId, body);
    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof Error && error.message.includes('見つかりません')) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/**
 * DELETE /api/users/[userId] - ユーザー削除
 *
 * ユーザーを削除します。
 * 必要な権限: users:write
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  // 認証チェック
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  // 権限チェック
  if (!hasPermission(session.user.roles, 'users:write')) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGES.FORBIDDEN,
        details: 'Required permission: users:write',
      },
      { status: 403 }
    );
  }

  // 自分自身を削除しようとしていないかチェック
  if (session.user.id === userId) {
    return NextResponse.json({ error: ERROR_MESSAGES.CANNOT_DELETE_SELF }, { status: 400 });
  }

  // ユーザー削除
  const repo = new DynamoDBUserRepository();
  try {
    await repo.deleteUser(userId);
    return NextResponse.json({
      success: true,
      deletedUserId: userId,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
