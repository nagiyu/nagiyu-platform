import { NextRequest, NextResponse } from 'next/server';
import { createUserRepository, UserNotFoundError } from '@nagiyu/auth-core';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { COMMON_ERROR_MESSAGES, hasPermission } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { UpdateUserSchema, USER_VALIDATION_ERROR_MESSAGES } from '../schemas';
import { ZodError } from 'zod';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  FORBIDDEN: COMMON_ERROR_MESSAGES.FORBIDDEN,
  USER_NOT_FOUND: COMMON_ERROR_MESSAGES.USER_NOT_FOUND,
  CANNOT_DELETE_SELF: '自分自身を削除することはできません',
  FETCH_USER_FAILED: 'ユーザー情報の取得に失敗しました',
  UPDATE_USER_FAILED: 'ユーザー情報の更新に失敗しました',
  DELETE_USER_FAILED: 'ユーザーの削除に失敗しました',
} as const;

/**
 * GET /api/users/[userId] - ユーザー詳細取得
 *
 * 必要な権限: users:read
 */
export const GET = withApiErrorReporting(
  'Web API: ユーザー詳細取得エラー',
  async (req: NextRequest, { params }: { params: Promise<{ userId: string }> }) => {
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

    const { userId } = await params;
    const repo = createUserRepository();
    const user = await repo.getUserById(userId);

    if (!user) {
      return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
    }

    return NextResponse.json(user);
  },
  ERROR_MESSAGES.FETCH_USER_FAILED
);

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
export const PATCH = withApiErrorReporting(
  'Web API: ユーザー情報更新エラー',
  async (req: NextRequest, { params }: { params: Promise<{ userId: string }> }) => {
    // 認証チェック
    const session = await getSession();

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
      const bodyResult = await readJsonObjectBody(req);
      if (!bodyResult.ok) {
        return NextResponse.json(
          {
            error: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
            details: [{ field: '', message: USER_VALIDATION_ERROR_MESSAGES.BODY_NOT_OBJECT }],
          },
          { status: 400 }
        );
      }

      // リクエストボディのバリデーション
      const validatedData = UpdateUserSchema.parse(bodyResult.body);

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

      const repo = createUserRepository();

      // ユーザー情報を更新（リポジトリ層で存在チェックを実施）
      const updatedUser = await repo.updateUser(userId, validatedData);

      return NextResponse.json(updatedUser);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
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

      throw error;
    }
  },
  ERROR_MESSAGES.UPDATE_USER_FAILED
);

/**
 * DELETE /api/users/[userId] - ユーザー削除
 *
 * 必要な権限: users:write
 */
export const DELETE = withApiErrorReporting(
  'Web API: ユーザー削除エラー',
  async (req: NextRequest, { params }: { params: Promise<{ userId: string }> }) => {
    // 認証チェック
    const session = await getSession();

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

    const { userId } = await params;

    // 自分自身を削除しようとしていないかチェック
    if (userId === session.user.id) {
      return NextResponse.json({ error: ERROR_MESSAGES.CANNOT_DELETE_SELF }, { status: 400 });
    }

    const repo = createUserRepository();

    // ユーザーを削除（DynamoDB の DeleteCommand は存在しない場合でも成功するため、事前の存在チェックは不要）
    await repo.deleteUser(userId);

    return NextResponse.json({ message: 'ユーザーが正常に削除されました' });
  },
  ERROR_MESSAGES.DELETE_USER_FAILED
);
