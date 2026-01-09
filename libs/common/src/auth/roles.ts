/**
 * Role and Permission Definitions
 *
 * Defines all roles and their associated permissions for the nagiyu platform.
 * Roles are managed in code (not in database) to ensure version control and
 * easy deployment.
 *
 * Permission naming convention: {resource}:{action}
 * Examples: 'users:read', 'users:write', 'roles:assign'
 */

/**
 * Role definition structure
 */
interface RoleDefinition {
  /** Unique role identifier (kebab-case) */
  id: string;
  /** Human-readable role name (Japanese) */
  name: string;
  /** Description of the role's purpose and scope */
  description: string;
  /** Array of permissions granted to this role */
  permissions: string[];
}

/**
 * All roles defined for Phase 1
 *
 * Use `as const` to enable type inference for role IDs
 */
export const ROLES = {
  admin: {
    id: 'admin',
    name: '管理者',
    description: 'Phase 1 ではユーザー管理とロール割り当ての全権限を持つ',
    permissions: ['users:read', 'users:write', 'roles:assign'],
  },
  'user-manager': {
    id: 'user-manager',
    name: 'ユーザー管理者',
    description: 'ユーザー管理のみ可能',
    permissions: ['users:read', 'users:write'],
  },
} as const satisfies Record<string, RoleDefinition>;

/**
 * Phase 2 以降で追加予定のロール:
 * - log-viewer: { id: 'log-viewer', name: 'ログ閲覧者', permissions: ['logs:read'] }
 *
 * Phase 2 では admin ロールに logs:read, logs:write 権限も追加予定
 */

/**
 * すべての有効なロールIDの配列
 * APIエンドポイントでのバリデーションに使用
 */
export const VALID_ROLES = Object.keys(ROLES) as string[];
