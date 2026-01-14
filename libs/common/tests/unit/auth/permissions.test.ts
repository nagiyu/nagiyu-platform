/**
 * Unit tests for permission checking functions
 */

import {
  hasPermission,
  requirePermission,
  hasAnyPermission,
  hasAllPermissions,
} from '../../../src/auth/permissions';

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

  describe('Stock Tracker Permissions', () => {
    describe('stock-viewer role', () => {
      it('should have stocks:read permission', () => {
        expect(hasPermission(['stock-viewer'], 'stocks:read')).toBe(true);
      });

      it('should not have stocks:write-own permission', () => {
        expect(hasPermission(['stock-viewer'], 'stocks:write-own')).toBe(false);
      });

      it('should not have stocks:manage-data permission', () => {
        expect(hasPermission(['stock-viewer'], 'stocks:manage-data')).toBe(false);
      });
    });

    describe('stock-user role', () => {
      it('should have stocks:read permission', () => {
        expect(hasPermission(['stock-user'], 'stocks:read')).toBe(true);
      });

      it('should have stocks:write-own permission', () => {
        expect(hasPermission(['stock-user'], 'stocks:write-own')).toBe(true);
      });

      it('should not have stocks:manage-data permission', () => {
        expect(hasPermission(['stock-user'], 'stocks:manage-data')).toBe(false);
      });
    });

    describe('stock-admin role', () => {
      it('should have stocks:read permission', () => {
        expect(hasPermission(['stock-admin'], 'stocks:read')).toBe(true);
      });

      it('should have stocks:write-own permission', () => {
        expect(hasPermission(['stock-admin'], 'stocks:write-own')).toBe(true);
      });

      it('should have stocks:manage-data permission', () => {
        expect(hasPermission(['stock-admin'], 'stocks:manage-data')).toBe(true);
      });
    });

    describe('Permission hierarchy validation', () => {
      it('stock-viewer should only access read operations', () => {
        expect(hasPermission(['stock-viewer'], 'stocks:read')).toBe(true);
        expect(hasAnyPermission(['stock-viewer'], ['stocks:write-own', 'stocks:manage-data'])).toBe(
          false
        );
      });

      it('stock-user should access read and write-own but not manage-data', () => {
        expect(hasAllPermissions(['stock-user'], ['stocks:read', 'stocks:write-own'])).toBe(true);
        expect(hasPermission(['stock-user'], 'stocks:manage-data')).toBe(false);
      });

      it('stock-admin should have all Stock Tracker permissions', () => {
        expect(
          hasAllPermissions(
            ['stock-admin'],
            ['stocks:read', 'stocks:write-own', 'stocks:manage-data']
          )
        ).toBe(true);
      });

      it('admin role should not have Stock Tracker permissions', () => {
        expect(hasPermission(['admin'], 'stocks:read')).toBe(false);
        expect(hasPermission(['admin'], 'stocks:write-own')).toBe(false);
        expect(hasPermission(['admin'], 'stocks:manage-data')).toBe(false);
      });
    });

    describe('requirePermission with Stock Tracker roles', () => {
      it('should not throw for stock-user with stocks:read', () => {
        expect(() => requirePermission(['stock-user'], 'stocks:read')).not.toThrow();
      });

      it('should throw for stock-viewer with stocks:manage-data', () => {
        expect(() => requirePermission(['stock-viewer'], 'stocks:manage-data')).toThrow(
          'Permission denied: stocks:manage-data'
        );
      });

      it('should not throw for stock-admin with stocks:manage-data', () => {
        expect(() => requirePermission(['stock-admin'], 'stocks:manage-data')).not.toThrow();
      });
    });
  });
});
