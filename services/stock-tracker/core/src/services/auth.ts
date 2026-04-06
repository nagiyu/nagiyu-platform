/**
 * Authentication Service
 *
 * Handles authentication and authorization logic for Stock Tracker.
 * This service is framework-agnostic and can be tested independently.
 */

import { hasPermission } from '@nagiyu/common';
import type { Permission, Session } from '@nagiyu/common';

/**
 * エラーメッセージ定数
 */
export const AUTH_ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
} as const;

/**
 * セッションから認証エラーを生成
 *
 * @param session - セッション情報（null の場合は未認証）
 * @param permission - 必要な権限
 * @returns エラーメッセージとステータスコード
 */
export function getAuthError(
  session: Session | null,
  permission: Permission
): { message: string; statusCode: number } | null {
  if (!session) {
    return {
      message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
      statusCode: 401,
    };
  }

  if (!hasPermission(session.user.roles, permission)) {
    return {
      message: AUTH_ERROR_MESSAGES.FORBIDDEN,
      statusCode: 403,
    };
  }

  return null;
}
