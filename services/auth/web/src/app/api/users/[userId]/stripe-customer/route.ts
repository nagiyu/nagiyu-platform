import { NextRequest, NextResponse } from 'next/server';
import { createUserRepository } from '@nagiyu/auth-core';
import { EntityNotFoundError, OptimisticLockError } from '@nagiyu/aws';
import { COMMON_ERROR_MESSAGES, hasPermission } from '@nagiyu/common';
import { buildStripeUnlink, StripeCustomerNotLinkedError } from '@/lib/stripe-customer-unlink';
import { getSession } from '@/lib/auth/session';
import { withApiErrorReporting } from '@/lib/api-error-reporting';

const ERROR_MESSAGES = {
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  FORBIDDEN: COMMON_ERROR_MESSAGES.FORBIDDEN,
  USER_NOT_FOUND: COMMON_ERROR_MESSAGES.USER_NOT_FOUND,
  UNLINK_FAILED: 'Stripe の顧客との対応を外すことに失敗しました',
  UPDATE_CONFLICT: '他の更新と競合しました。再読み込みしてください',
} as const;

/**
 * DELETE /api/users/[userId]/stripe-customer - Stripe の顧客との対応を外す
 *
 * Stripe 上の顧客や契約は変更しない。対応が無いユーザーは 404 を返す。
 *
 * 必要な権限: roles:assign
 */
export const DELETE = withApiErrorReporting(
  'Web API: Stripe 顧客の対応解除エラー',
  async (_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) => {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

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
      const repo = createUserRepository();

      // 競合時にやり直されるため、計算は読み直した値に対して行う
      const updatedUser = await repo.updateRolesAndGrants(userId, (user) =>
        buildStripeUnlink(user, Date.now())
      );

      return NextResponse.json(updatedUser);
    } catch (error) {
      if (error instanceof StripeCustomerNotLinkedError) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error instanceof OptimisticLockError) {
        return NextResponse.json({ error: ERROR_MESSAGES.UPDATE_CONFLICT }, { status: 409 });
      }

      if (error instanceof EntityNotFoundError) {
        return NextResponse.json({ error: ERROR_MESSAGES.USER_NOT_FOUND }, { status: 404 });
      }

      throw error;
    }
  },
  ERROR_MESSAGES.UNLINK_FAILED
);
