import { ROLES, VALID_ROLES } from '../../../src/auth/roles';

describe('VALID_ROLES', () => {
  it('すべての定義済みロールIDを含むべき', () => {
    const roleIds = Object.keys(ROLES);
    expect(VALID_ROLES).toEqual(roleIds);
  });

  it('Phase 1 で定義されたロールを含むべき', () => {
    expect(VALID_ROLES).toContain('admin');
    expect(VALID_ROLES).toContain('user-manager');
    expect(VALID_ROLES).toContain('stock-viewer');
    expect(VALID_ROLES).toContain('stock-user');
    expect(VALID_ROLES).toContain('stock-admin');
    expect(VALID_ROLES).toContain('livetalk-user');
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
      expect(ROLES.admin.permissions).toContain('notifications:write');
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

  describe('stock-viewer role', () => {
    it('正しい構造を持つべき', () => {
      expect(ROLES['stock-viewer']).toBeDefined();
      expect(ROLES['stock-viewer'].id).toBe('stock-viewer');
      expect(ROLES['stock-viewer'].name).toBe('Stock 閲覧者');
      expect(ROLES['stock-viewer'].description).toBeDefined();
      expect(Array.isArray(ROLES['stock-viewer'].permissions)).toBe(true);
    });

    it('stocks:read 権限のみを持つべき', () => {
      expect(ROLES['stock-viewer'].permissions).toContain('stocks:read');
      expect(ROLES['stock-viewer'].permissions).toHaveLength(1);
    });

    it('stocks:write-own 権限を持たないべき', () => {
      expect(ROLES['stock-viewer'].permissions).not.toContain('stocks:write-own');
    });

    it('stocks:manage-data 権限を持たないべき', () => {
      expect(ROLES['stock-viewer'].permissions).not.toContain('stocks:manage-data');
    });
  });

  describe('stock-user role', () => {
    it('正しい構造を持つべき', () => {
      expect(ROLES['stock-user']).toBeDefined();
      expect(ROLES['stock-user'].id).toBe('stock-user');
      expect(ROLES['stock-user'].name).toBe('Stock ユーザー');
      expect(ROLES['stock-user'].description).toBeDefined();
      expect(Array.isArray(ROLES['stock-user'].permissions)).toBe(true);
    });

    it('stocks:read と stocks:write-own 権限を持つべき', () => {
      expect(ROLES['stock-user'].permissions).toContain('stocks:read');
      expect(ROLES['stock-user'].permissions).toContain('stocks:write-own');
      expect(ROLES['stock-user'].permissions).toHaveLength(2);
    });

    it('stocks:manage-data 権限を持たないべき', () => {
      expect(ROLES['stock-user'].permissions).not.toContain('stocks:manage-data');
    });
  });

  describe('stock-admin role', () => {
    it('正しい構造を持つべき', () => {
      expect(ROLES['stock-admin']).toBeDefined();
      expect(ROLES['stock-admin'].id).toBe('stock-admin');
      expect(ROLES['stock-admin'].name).toBe('Stock 管理者');
      expect(ROLES['stock-admin'].description).toBeDefined();
      expect(Array.isArray(ROLES['stock-admin'].permissions)).toBe(true);
    });

    it('すべての Stock Tracker 権限を持つべき', () => {
      expect(ROLES['stock-admin'].permissions).toContain('stocks:read');
      expect(ROLES['stock-admin'].permissions).toContain('stocks:write-own');
      expect(ROLES['stock-admin'].permissions).toContain('stocks:manage-data');
      expect(ROLES['stock-admin'].permissions).toContain('stocks:read-evaluation');
      expect(ROLES['stock-admin'].permissions).toHaveLength(4);
    });

    it('stocks:read-evaluation 権限を持つべき（予測精度ダッシュボード閲覧）', () => {
      expect(ROLES['stock-admin'].permissions).toContain('stocks:read-evaluation');
    });
  });

  describe('stocks:read-evaluation 権限の付与範囲', () => {
    it('stock-admin のみが stocks:read-evaluation を持つべき', () => {
      expect(ROLES['stock-admin'].permissions).toContain('stocks:read-evaluation');
      expect(ROLES['stock-viewer'].permissions).not.toContain('stocks:read-evaluation');
      expect(ROLES['stock-user'].permissions).not.toContain('stocks:read-evaluation');
      expect(ROLES.admin.permissions).not.toContain('stocks:read-evaluation');
      expect(ROLES['user-manager'].permissions).not.toContain('stocks:read-evaluation');
    });
  });

  describe('livetalk-user role', () => {
    it('正しい構造を持つべき', () => {
      expect(ROLES['livetalk-user']).toBeDefined();
      expect(ROLES['livetalk-user'].id).toBe('livetalk-user');
      expect(ROLES['livetalk-user'].name).toBe('LiveTalk ユーザー');
      expect(ROLES['livetalk-user'].description).toBeDefined();
      expect(Array.isArray(ROLES['livetalk-user'].permissions)).toBe(true);
    });

    it('livetalk:chat 権限のみを持つべき', () => {
      expect(ROLES['livetalk-user'].permissions).toContain('livetalk:chat');
      expect(ROLES['livetalk-user'].permissions).toHaveLength(1);
    });
  });

  describe('livetalk:chat 権限の付与範囲', () => {
    it('livetalk-user のみが livetalk:chat を持つべき', () => {
      expect(ROLES['livetalk-user'].permissions).toContain('livetalk:chat');
      expect(ROLES.admin.permissions).not.toContain('livetalk:chat');
      expect(ROLES['user-manager'].permissions).not.toContain('livetalk:chat');
      expect(ROLES['stock-viewer'].permissions).not.toContain('livetalk:chat');
      expect(ROLES['stock-user'].permissions).not.toContain('livetalk:chat');
      expect(ROLES['stock-admin'].permissions).not.toContain('livetalk:chat');
    });
  });
});
