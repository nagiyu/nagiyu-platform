import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { DynamoDBUserRepository } from '@/lib/db/repositories/dynamodb-user-repository';
import { hasPermission } from '@nagiyu/common/auth';

const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  USER_NOT_FOUND: 'ユーザーが見つかりません',
  CANNOT_DELETE_SELF: '自分自身を削除することはできません',
  CANNOT_DELETE_LAST_ADMIN: '最後の管理者を削除することはできません',
  CANNOT_MODIFY_SELF_ROLES: '自分自身のロールを変更することはできません',
  INVALID_NAME_LENGTH: '名前は1〜100文字で入力してください',
  INVALID_ROLES: 'ロールが不正です',
} as const;

type Params = {
  params: Promise<{ userId: string }>;
};

export async function GET(req: NextRequest, { params }: Params) {
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

  const { userId } = await params;
  const repo = new DynamoDBUserRepository();
  const user = await repo.getUserById(userId);

  if (!user) {
    return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  if (!hasPermission(session.user.roles, 'users:write')) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGES.FORBIDDEN,
        details: 'Required permission: users:write',
      },
      { status: 403 }
    );
  }

  const { userId } = await params;
  const body = await req.json();

  // バリデーション: name の長さチェック
  if (body.name && (body.name.length < 1 || body.name.length > 100)) {
    return NextResponse.json({ error: ERROR_MESSAGES.INVALID_NAME_LENGTH }, { status: 400 });
  }

  // バリデーション: roles が配列であることをチェック
  if (body.roles && !Array.isArray(body.roles)) {
    return NextResponse.json({ error: ERROR_MESSAGES.INVALID_ROLES }, { status: 400 });
  }

  // ロール変更の場合は roles:assign 権限が必要
  if (body.roles && !hasPermission(session.user.roles, 'roles:assign')) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGES.FORBIDDEN,
        details: 'Required permission: roles:assign',
      },
      { status: 403 }
    );
  }

  // 自分自身のロールは変更できない（権限昇格の防止）
  if (body.roles && userId === session.user.id) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.CANNOT_MODIFY_SELF_ROLES },
      { status: 400 }
    );
  }

  const repo = new DynamoDBUserRepository();

  try {
    const updatedUser = await repo.updateUser(userId, body);
    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ユーザーが見つかりません')) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  if (!hasPermission(session.user.roles, 'users:write')) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGES.FORBIDDEN,
        details: 'Required permission: users:write',
      },
      { status: 403 }
    );
  }

  const { userId } = await params;

  // 自分自身は削除できない
  if (userId === session.user.id) {
    return NextResponse.json({ error: ERROR_MESSAGES.CANNOT_DELETE_SELF }, { status: 400 });
  }

  const repo = new DynamoDBUserRepository();

  // 削除対象ユーザーを取得
  const userToDelete = await repo.getUserById(userId);
  if (!userToDelete) {
    return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
  }

  // 最後の管理者は削除できない
  if (userToDelete.roles.includes('admin')) {
    const { users } = await repo.listUsers(1000);
    const adminCount = users.filter((u) => u.roles.includes('admin')).length;

    if (adminCount <= 1) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.CANNOT_DELETE_LAST_ADMIN },
        { status: 400 }
      );
    }
  }

  await repo.deleteUser(userId);

  return NextResponse.json({ message: 'User deleted successfully' });
}
