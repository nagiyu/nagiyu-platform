import { NextRequest, NextResponse } from 'next/server';
import { auth, DynamoDBUserRepository } from '@nagiyu/auth-core';
import { hasPermission } from '@nagiyu/common';
import { UpdateUserSchema } from '../schemas';
import { ZodError } from 'zod';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  USER_NOT_FOUND: 'ユーザーが見つかりません',
  CANNOT_DELETE_SELF: '自分自身を削除することはできません',
} as const;

/**
 * GET /api/users/[userId] - ユーザー詳細取得
 *
 * 必要な権限: users:read
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
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
    const { userId } = await params;
    const repo = new DynamoDBUserRepository();
    const user = await repo.getUserById(userId);

    if (!user) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'ユーザー情報の取得に失敗しました' }, { status: 500 });
  }
}

/**
 * PATCH /api/users/[userId] - ユーザー情報更新
 *
 * リクエストボディ:
 * - name?: string - 表示名
 * - roles?: string[] - ロール配列
 *
 * 必要な権限:
 * - users:write (名前更新)
 * - roles:assign (ロール変更)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
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

  try {
    const { userId } = await params;
    const body = await req.json();

    // リクエストボディのバリデーション
    const validatedData = UpdateUserSchema.parse(body);

    // ロール変更の権限チェック
    if (validatedData.roles && !hasPermission(session.user.roles, 'roles:assign')) {
      return NextResponse.json(
        {
          error: ERROR_MESSAGES.FORBIDDEN,
          details: 'Required permission: roles:assign',
        },
        { status: 403 }
      );
    }

    const repo = new DynamoDBUserRepository();

    // ユーザー情報を更新（リポジトリ層で存在チェックを実施）
    const updatedUser = await repo.updateUser(userId, validatedData);

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof ZodError) {
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
    if (error instanceof Error && error.message.includes('ユーザーが見つかりません')) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'ユーザー情報の更新に失敗しました' }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[userId] - ユーザー削除
 *
 * 必要な権限: users:write
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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

  try {
    const { userId } = await params;

    // 自分自身を削除しようとしていないかチェック
    if (userId === session.user.id) {
      return NextResponse.json({ error: ERROR_MESSAGES.CANNOT_DELETE_SELF }, { status: 400 });
    }

    const repo = new DynamoDBUserRepository();

    // ユーザーを削除（DynamoDB の DeleteCommand は存在しない場合でも成功するため、事前の存在チェックは不要）
    await repo.deleteUser(userId);

    return NextResponse.json({ message: 'ユーザーが正常に削除されました' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'ユーザーの削除に失敗しました' }, { status: 500 });
  }
}
