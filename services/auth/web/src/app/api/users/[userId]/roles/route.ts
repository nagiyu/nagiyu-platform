import { NextRequest, NextResponse } from 'next/server';
import { createUserRepository, UserNotFoundError } from '@nagiyu/auth-core';
import { COMMON_ERROR_MESSAGES, VALID_ROLES, hasPermission } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { USER_VALIDATION_ERROR_MESSAGES } from '../../schemas';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  FORBIDDEN: COMMON_ERROR_MESSAGES.FORBIDDEN,
  USER_NOT_FOUND: COMMON_ERROR_MESSAGES.USER_NOT_FOUND,
  INVALID_ROLES: '無効なロールが含まれています',
  ASSIGN_ROLES_FAILED: 'ロールの割り当てに失敗しました',
} as const;

// ロール割り当てリクエストのバリデーションスキーマ
const AssignRolesSchema = z.object(
  {
    roles: z.array(z.string({ error: USER_VALIDATION_ERROR_MESSAGES.ROLE_NOT_STRING }), {
      error: USER_VALIDATION_ERROR_MESSAGES.ROLES_NOT_ARRAY,
    }),
  },
  { error: USER_VALIDATION_ERROR_MESSAGES.BODY_NOT_OBJECT }
);

/**
 * POST /api/users/[userId]/roles - ロール割り当て
 *
 * リクエストボディ:
 * - roles: string[] - 割り当てるロールID配列
 *
 * 必要な権限: roles:assign
 */
export const POST = withApiErrorReporting(
  'Web API: ロール割り当てエラー',
  async (req: NextRequest, { params }: { params: Promise<{ userId: string }> }) => {
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
      const validatedData = AssignRolesSchema.parse(bodyResult.body);
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

      const repo = createUserRepository();

      // ロールを割り当て
      const updatedUser = await repo.assignRoles(userId, roles);

      return NextResponse.json(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
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
  ERROR_MESSAGES.ASSIGN_ROLES_FAILED
);
