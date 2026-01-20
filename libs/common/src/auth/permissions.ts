/**
 * Permission Checking Functions
 *
 * Provides utility functions for checking user permissions based on their assigned roles.
 * These functions implement role-based access control (RBAC) for the nagiyu platform.
 */

import { ROLES } from './roles.js';
import type { Permission } from './types.js';

/**
 * Check if the user has a specific permission
 *
 * @param roles - Array of role IDs assigned to the user
 * @param permission - Required permission in the format {resource}:{action}
 * @returns true if the user has the permission, false otherwise
 *
 * @example
 * ```typescript
 * const canRead = hasPermission(['user-manager'], 'users:read');  // true
 * const canAssign = hasPermission(['user-manager'], 'roles:assign');  // false
 * ```
 */
export function hasPermission(roles: string[], permission: Permission): boolean {
  // Flatten all permissions from all assigned roles
  const userPermissions = roles.flatMap(
    (roleId) => (ROLES as Record<string, { permissions: string[] }>)[roleId]?.permissions ?? []
  );

  return userPermissions.includes(permission);
}

/**
 * Require a specific permission, throwing an error if not granted
 *
 * @param roles - Array of role IDs assigned to the user
 * @param permission - Required permission in the format {resource}:{action}
 * @throws Error if the user does not have the required permission
 *
 * @example
 * ```typescript
 * try {
 *   requirePermission(['user-manager'], 'roles:assign');
 * } catch (error) {
 *   // Handle permission denied
 * }
 * ```
 */
export function requirePermission(roles: string[], permission: Permission): void {
  if (!hasPermission(roles, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

/**
 * Check if the user has any of the specified permissions (OR condition)
 *
 * @param roles - Array of role IDs assigned to the user
 * @param permissions - Array of permissions to check
 * @returns true if the user has at least one of the permissions, false otherwise
 *
 * @example
 * ```typescript
 * const canAccess = hasAnyPermission(['user-manager'], ['users:read', 'users:write']);  // true
 * ```
 */
export function hasAnyPermission(roles: string[], permissions: Permission[]): boolean {
  return permissions.some((permission) => hasPermission(roles, permission));
}

/**
 * Check if the user has all of the specified permissions (AND condition)
 *
 * @param roles - Array of role IDs assigned to the user
 * @param permissions - Array of permissions to check
 * @returns true if the user has all of the permissions, false otherwise
 *
 * @example
 * ```typescript
 * const canManage = hasAllPermissions(['admin'], ['users:read', 'users:write']);  // true
 * const canManage2 = hasAllPermissions(['user-manager'], ['users:read', 'roles:assign']);  // false
 * ```
 */
export function hasAllPermissions(roles: string[], permissions: Permission[]): boolean {
  return permissions.every((permission) => hasPermission(roles, permission));
}
