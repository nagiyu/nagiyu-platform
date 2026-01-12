import { ROLES, VALID_ROLES } from '../../../src/auth/roles';

describe('VALID_ROLES', () => {
  it('すべての定義済みロールIDを含むべき', () => {
    const roleIds = Object.keys(ROLES);
    expect(VALID_ROLES).toEqual(roleIds);
  });

  it('Phase 1 で定義されたロールを含むべき', () => {
    expect(VALID_ROLES).toContain('admin');
    expect(VALID_ROLES).toContain('user-manager');
  });

  it('配列として提供されるべき', () => {
    expect(Array.isArray(VALID_ROLES)).toBe(true);
  });

  it('空でないべき', () => {
    expect(VALID_ROLES.length).toBeGreaterThan(0);
  });
});

describe('ROLES', () => {
  describe('admin role', () => {
    it('正しい構造を持つべき', () => {
      expect(ROLES.admin).toBeDefined();
      expect(ROLES.admin.id).toBe('admin');
      expect(ROLES.admin.name).toBe('管理者');
      expect(ROLES.admin.description).toBeDefined();
      expect(Array.isArray(ROLES.admin.permissions)).toBe(true);
    });

    it('Phase 1 の必要な権限を持つべき', () => {
      expect(ROLES.admin.permissions).toContain('users:read');
      expect(ROLES.admin.permissions).toContain('users:write');
      expect(ROLES.admin.permissions).toContain('roles:assign');
    });
  });

  describe('user-manager role', () => {
    it('正しい構造を持つべき', () => {
      expect(ROLES['user-manager']).toBeDefined();
      expect(ROLES['user-manager'].id).toBe('user-manager');
      expect(ROLES['user-manager'].name).toBe('ユーザー管理者');
      expect(ROLES['user-manager'].description).toBeDefined();
      expect(Array.isArray(ROLES['user-manager'].permissions)).toBe(true);
    });

    it('users:read と users:write 権限を持つべき', () => {
      expect(ROLES['user-manager'].permissions).toContain('users:read');
      expect(ROLES['user-manager'].permissions).toContain('users:write');
    });

    it('roles:assign 権限を持たないべき', () => {
      expect(ROLES['user-manager'].permissions).not.toContain('roles:assign');
    });
  });
});
