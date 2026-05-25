import { hasPermission } from './permissions.js';
import { COMMON_ERROR_MESSAGES } from '../constants/error-messages.js';
import type { Permission, Session } from './types.js';

export function getAuthError(
  session: Session | null,
  permission: Permission
): { message: string; statusCode: number } | null {
  if (!session) {
    return {
      message: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
      statusCode: 401,
    };
  }

  if (!hasPermission(session.user.roles, permission)) {
    return {
      message: COMMON_ERROR_MESSAGES.FORBIDDEN,
      statusCode: 403,
    };
  }

  return null;
}
