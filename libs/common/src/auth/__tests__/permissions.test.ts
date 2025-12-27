/**
 * Unit tests for permission checking functions
 */

import {
  hasPermission,
  requirePermission,
  hasAnyPermission,
  hasAllPermissions,
} from '../permissions';

describe('Permission Functions', () => {
  describe('hasPermission', () => {
    it('should return true when user has the required permission', () => {
      expect(hasPermission(['admin'], 'users:read')).toBe(true);
      expect(hasPermission(['admin'], 'users:write')).toBe(true);
      expect(hasPermission(['admin'], 'roles:assign')).toBe(true);
    });

    it('should return true for user-manager with users:read permission', () => {
      expect(hasPermission(['user-manager'], 'users:read')).toBe(true);
    });

    it('should return true for user-manager with users:write permission', () => {
      expect(hasPermission(['user-manager'], 'users:write')).toBe(true);
    });

    it('should return false when user does not have the required permission', () => {
      expect(hasPermission(['user-manager'], 'roles:assign')).toBe(false);
    });

    it('should return false for empty role array', () => {
      expect(hasPermission([], 'users:read')).toBe(false);
    });

    it('should return false for invalid role ID', () => {
      expect(hasPermission(['invalid-role'], 'users:read')).toBe(false);
    });

    it('should handle multiple roles correctly (OR logic)', () => {
      expect(hasPermission(['user-manager', 'admin'], 'roles:assign')).toBe(true);
      expect(hasPermission(['user-manager', 'admin'], 'users:read')).toBe(true);
    });

    it('should flatten permissions from multiple roles', () => {
      const roles = ['admin', 'user-manager'];
      expect(hasPermission(roles, 'users:read')).toBe(true);
      expect(hasPermission(roles, 'users:write')).toBe(true);
      expect(hasPermission(roles, 'roles:assign')).toBe(true);
    });

    it('should return false for non-existent permission', () => {
      expect(hasPermission(['admin'], 'logs:read')).toBe(false);
    });
  });

  describe('requirePermission', () => {
    it('should not throw when user has the required permission', () => {
      expect(() => requirePermission(['admin'], 'users:read')).not.toThrow();
      expect(() => requirePermission(['user-manager'], 'users:write')).not.toThrow();
    });

    it('should throw Error when user does not have the required permission', () => {
      expect(() => requirePermission(['user-manager'], 'roles:assign')).toThrow(
        'Permission denied: roles:assign'
      );
    });

    it('should throw Error with correct message format', () => {
      expect(() => requirePermission([], 'users:read')).toThrow('Permission denied: users:read');
    });

    it('should throw Error for invalid role', () => {
      expect(() => requirePermission(['invalid-role'], 'users:read')).toThrow(
        'Permission denied: users:read'
      );
    });

    it('should not throw for multiple roles with required permission', () => {
      expect(() => requirePermission(['user-manager', 'admin'], 'roles:assign')).not.toThrow();
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true when user has at least one of the permissions', () => {
      expect(hasAnyPermission(['user-manager'], ['users:read', 'roles:assign'])).toBe(true);
      expect(hasAnyPermission(['admin'], ['users:read', 'users:write'])).toBe(true);
    });

    it('should return true when user has all of the permissions', () => {
      expect(hasAnyPermission(['admin'], ['users:read', 'users:write', 'roles:assign'])).toBe(true);
    });

    it('should return false when user has none of the permissions', () => {
      expect(hasAnyPermission(['user-manager'], ['roles:assign', 'logs:read'])).toBe(false);
    });

    it('should return false for empty permissions array', () => {
      expect(hasAnyPermission(['admin'], [])).toBe(false);
    });

    it('should return false for empty role array', () => {
      expect(hasAnyPermission([], ['users:read', 'users:write'])).toBe(false);
    });

    it('should handle multiple roles correctly', () => {
      expect(hasAnyPermission(['user-manager', 'admin'], ['logs:read', 'roles:assign'])).toBe(true);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true when user has all of the permissions', () => {
      expect(hasAllPermissions(['admin'], ['users:read', 'users:write', 'roles:assign'])).toBe(
        true
      );
    });

    it('should return true for user-manager with subset of permissions', () => {
      expect(hasAllPermissions(['user-manager'], ['users:read', 'users:write'])).toBe(true);
    });

    it('should return false when user is missing at least one permission', () => {
      expect(hasAllPermissions(['user-manager'], ['users:read', 'roles:assign'])).toBe(false);
    });

    it('should return false when user is missing all permissions', () => {
      expect(hasAllPermissions(['user-manager'], ['roles:assign', 'logs:read'])).toBe(false);
    });

    it('should return true for empty permissions array', () => {
      expect(hasAllPermissions(['admin'], [])).toBe(true);
    });

    it('should return false for empty role array with required permissions', () => {
      expect(hasAllPermissions([], ['users:read'])).toBe(false);
    });

    it('should return true for empty role and empty permissions arrays', () => {
      expect(hasAllPermissions([], [])).toBe(true);
    });

    it('should handle multiple roles correctly', () => {
      expect(
        hasAllPermissions(['user-manager', 'admin'], ['users:read', 'users:write', 'roles:assign'])
      ).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle case-sensitive permission names', () => {
      expect(hasPermission(['admin'], 'Users:Read')).toBe(false);
      expect(hasPermission(['admin'], 'USERS:READ')).toBe(false);
    });

    it('should handle whitespace in permission names', () => {
      expect(hasPermission(['admin'], ' users:read')).toBe(false);
      expect(hasPermission(['admin'], 'users:read ')).toBe(false);
    });

    it('should handle partial permission matches', () => {
      expect(hasPermission(['admin'], 'users')).toBe(false);
      expect(hasPermission(['admin'], 'read')).toBe(false);
      expect(hasPermission(['admin'], 'users:')).toBe(false);
    });
  });

  describe('Complex Scenarios', () => {
    it('should correctly evaluate permissions with multiple roles assigned', () => {
      const multipleRoles = ['admin', 'user-manager'];

      // Should have all admin permissions
      expect(hasPermission(multipleRoles, 'users:read')).toBe(true);
      expect(hasPermission(multipleRoles, 'users:write')).toBe(true);
      expect(hasPermission(multipleRoles, 'roles:assign')).toBe(true);

      // Should still not have non-existent permissions
      expect(hasPermission(multipleRoles, 'logs:read')).toBe(false);
    });

    it('should work correctly with duplicate roles', () => {
      const duplicateRoles = ['admin', 'admin', 'user-manager'];
      expect(hasPermission(duplicateRoles, 'users:read')).toBe(true);
      expect(hasPermission(duplicateRoles, 'roles:assign')).toBe(true);
    });

    it('should handle mixed valid and invalid roles', () => {
      const mixedRoles = ['admin', 'invalid-role', 'user-manager'];
      expect(hasPermission(mixedRoles, 'users:read')).toBe(true);
      expect(hasPermission(mixedRoles, 'roles:assign')).toBe(true);
      expect(hasPermission(mixedRoles, 'logs:read')).toBe(false);
    });
  });
});
