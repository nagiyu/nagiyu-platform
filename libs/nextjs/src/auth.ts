/**
 * Authentication Helper for Next.js API Routes
 *
 * Provides authentication and authorization helpers for Next.js API Routes.
 * Based on Stock Tracker's auth implementation.
 */

import { NextResponse } from 'next/server';
import type { Session, Permission } from '@nagiyu/common';
import { ERROR_CODES, hasPermission } from '@nagiyu/common';

/**
 * 認証エラー情報
 */
export interface AuthError {
  message: string;
  statusCode: number;
}

/**
 * エラーメッセージ定数
 */
const AUTH_ERROR_MESSAGES = {
  UNAUTHORIZED: 'ログインが必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  AUTH_PROCESSING_ERROR: '認証処理に失敗しました',
} as const;

/**
 * セッションから権限エラーを取得
 *
 * Stock Tracker の getAuthError() をベースに実装
 *
 * @param session - セッション情報（null の場合は未認証）
 * @param permission - 必要な権限
 * @returns エラーメッセージとステータスコード、エラーがない場合は null
 *
 * @example
 * ```typescript
 * const session = await getOptionalSession();
 * const authError = getAuthError(session, 'stocks:read');
 * if (authError) {
 *   return NextResponse.json({ error: 'UNAUTHORIZED', message: authError.message }, { status: authError.statusCode });
 * }
 * ```
 */
export function getAuthError(session: Session | null, permission: Permission): AuthError | null {
  // 未認証チェック
  if (!session) {
    return {
      message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
      statusCode: 401,
    };
  }

  // 権限チェック
  if (!hasPermission(session.user.roles, permission)) {
    return {
      message: AUTH_ERROR_MESSAGES.FORBIDDEN,
      statusCode: 403,
    };
  }

  return null;
}

/**
 * セッション取得 or エラーをスロー
 *
 * @returns セッション情報
 * @throws セッションが取得できない場合
 *
 * @example
 * ```typescript
 * try {
 *   const session = await getSessionOrThrow();
 *   // セッション情報を使用
 * } catch (error) {
 *   // エラーハンドリング
 * }
 * ```
 */
export async function getSessionOrThrow(): Promise<Session> {
  const { getServerSession } = await import('next-auth/next');
  const session = await getServerSession();

  if (!session) {
    throw new Error('UNAUTHORIZED');
  }

  return session as Session;
}

/**
 * オプショナルなセッション取得
 *
 * @returns セッション情報、未認証の場合は null
 *
 * @example
 * ```typescript
 * const session = await getOptionalSession();
 * if (!session) {
 *   // 未認証の処理
 * }
 * ```
 */
export async function getOptionalSession(): Promise<Session | null> {
  const { getServerSession } = await import('next-auth/next');
  return (await getServerSession()) as Session | null;
}

/**
 * 認証を要求する高階関数
 *
 * API Route ハンドラーをラップして、認証・権限チェックを自動化します。
 *
 * @param permission - 必要な権限
 * @param handler - 元のハンドラー関数
 * @returns ラップされたハンドラー関数
 *
 * @example
 * ```typescript
 * export const GET = withAuth('stocks:read', async (session, request) => {
 *   // 認証済みの処理
 *   return NextResponse.json({ data: 'success' });
 * });
 * ```
 */
export function withAuth<T extends unknown[]>(
  permission: Permission,
  handler: (session: Session, ...args: T) => Promise<NextResponse>
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      const session = await getOptionalSession();
      const authError = getAuthError(session, permission);

      if (authError) {
        return NextResponse.json(
          {
            error: authError.statusCode === 401 ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.FORBIDDEN,
            message: authError.message,
          },
          { status: authError.statusCode }
        );
      }

      return await handler(session!, ...args);
    } catch (error) {
      console.error('Auth error:', error);
      return NextResponse.json(
        {
          error: ERROR_CODES.INTERNAL_ERROR,
          message: AUTH_ERROR_MESSAGES.AUTH_PROCESSING_ERROR,
        },
        { status: 500 }
      );
    }
  };
}
