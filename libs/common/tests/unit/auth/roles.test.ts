import {
  BILLING_SERVICES,
  BILLING_TIER_ERROR_MESSAGES,
  PAID_ROLES,
  ROLES,
  VALID_ROLES,
  compareBillingTier,
  getBillingServiceId,
  getBillingTierRoleIds,
} from '../../../src/auth/roles';

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
    expect(VALID_ROLES).toContain('livetalk-admin');
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
      expect(ROLES['stock-admin'].permissions).toHaveLength(3);
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
    it('livetalk-user と livetalk-admin が livetalk:chat を持つべき', () => {
      expect(ROLES['livetalk-user'].permissions).toContain('livetalk:chat');
      expect(ROLES['livetalk-admin'].permissions).toContain('livetalk:chat');
      expect(ROLES.admin.permissions).not.toContain('livetalk:chat');
      expect(ROLES['user-manager'].permissions).not.toContain('livetalk:chat');
      expect(ROLES['stock-viewer'].permissions).not.toContain('livetalk:chat');
      expect(ROLES['stock-user'].permissions).not.toContain('livetalk:chat');
      expect(ROLES['stock-admin'].permissions).not.toContain('livetalk:chat');
    });
  });

  describe('livetalk-admin role', () => {
    it('正しい構造を持つべき', () => {
      expect(ROLES['livetalk-admin']).toBeDefined();
      expect(ROLES['livetalk-admin'].id).toBe('livetalk-admin');
      expect(ROLES['livetalk-admin'].name).toBe('LiveTalk 管理者');
      expect(ROLES['livetalk-admin'].description).toBeDefined();
      expect(Array.isArray(ROLES['livetalk-admin'].permissions)).toBe(true);
    });

    it('livetalk:chat と livetalk:admin 権限を持つべき', () => {
      expect(ROLES['livetalk-admin'].permissions).toContain('livetalk:chat');
      expect(ROLES['livetalk-admin'].permissions).toContain('livetalk:admin');
      expect(ROLES['livetalk-admin'].permissions).toHaveLength(2);
    });

    it('livetalk:admin 権限のみを持つべき（それ以外の権限は不要）', () => {
      expect(ROLES['livetalk-admin'].permissions).not.toContain('users:read');
      expect(ROLES['livetalk-admin'].permissions).not.toContain('stocks:read');
    });
  });

  describe('livetalk:admin 権限の付与範囲', () => {
    it('livetalk-admin のみが livetalk:admin を持つべき', () => {
      expect(ROLES['livetalk-admin'].permissions).toContain('livetalk:admin');
      expect(ROLES['livetalk-user'].permissions).not.toContain('livetalk:admin');
      expect(ROLES.admin.permissions).not.toContain('livetalk:admin');
      expect(ROLES['user-manager'].permissions).not.toContain('livetalk:admin');
      expect(ROLES['stock-admin'].permissions).not.toContain('livetalk:admin');
    });
  });
});

describe('quick-clip-unlimited ロール', () => {
  it('手動ロールとして VALID_ROLES に含まれ、quick-clip:unlimited だけを持つべき', () => {
    expect(VALID_ROLES).toContain('quick-clip-unlimited');
    expect(ROLES['quick-clip-unlimited']).toMatchObject({
      id: 'quick-clip-unlimited',
      name: 'Quick Clip 使い放題',
      permissions: ['quick-clip:unlimited'],
    });
  });

  it('billing を持たず、PAID_ROLES に入らないべき', () => {
    expect('billing' in ROLES['quick-clip-unlimited']).toBe(false);
    expect(PAID_ROLES).not.toContain('quick-clip-unlimited');
    expect(getBillingServiceId('quick-clip-unlimited')).toBeUndefined();
    expect(getBillingTierRoleIds('quick-clip')).not.toContain('quick-clip-unlimited');
  });
});

describe('billing-tester ロール', () => {
  it('手動ロールとして VALID_ROLES に含まれ、billing:test だけを持つべき', () => {
    expect(VALID_ROLES).toContain('billing-tester');
    expect(ROLES['billing-tester']).toMatchObject({
      id: 'billing-tester',
      name: '課金のテスト',
      permissions: ['billing:test'],
    });
  });

  it('billing を持たず、PAID_ROLES に入らないべき', () => {
    expect('billing' in ROLES['billing-tester']).toBe(false);
    expect(PAID_ROLES).not.toContain('billing-tester');
    expect(getBillingServiceId('billing-tester')).toBeUndefined();
  });

  it('管理者の権限とは分かれているべき', () => {
    expect(ROLES.admin.permissions).not.toContain('billing:test');
    expect(ROLES['billing-tester'].permissions).not.toContain('roles:assign');
  });
});

describe('有料ロール', () => {
  it('3 つの有料ロールの構造と権限を持つべき', () => {
    expect(ROLES['livetalk-standard']).toMatchObject({
      id: 'livetalk-standard',
      name: 'LiveTalk スタンダード',
      permissions: ['livetalk:standard'],
      billing: { service: 'livetalk', rank: 1 },
    });
    expect(ROLES['quick-clip-standard']).toMatchObject({
      id: 'quick-clip-standard',
      name: 'Quick Clip スタンダード',
      permissions: ['quick-clip:standard'],
      billing: { service: 'quick-clip', rank: 1 },
    });
    expect(ROLES['quick-clip-pro']).toMatchObject({
      id: 'quick-clip-pro',
      name: 'Quick Clip プロ',
      permissions: ['quick-clip:standard', 'quick-clip:pro'],
      billing: { service: 'quick-clip', rank: 2 },
    });
  });

  it('旧プレミアムロールは存在しないべき', () => {
    expect(VALID_ROLES).not.toContain('livetalk-premium');
    expect(VALID_ROLES).not.toContain('quick-clip-premium');
  });

  it('PAID_ROLES は有料ロールだけを含み、サービス → rank 昇順で並ぶべき', () => {
    expect(PAID_ROLES).toEqual(['livetalk-standard', 'quick-clip-standard', 'quick-clip-pro']);
    for (const roleId of PAID_ROLES) {
      expect(VALID_ROLES).toContain(roleId);
    }
    expect(PAID_ROLES).not.toContain('admin');
    expect(PAID_ROLES).not.toContain('livetalk-user');
  });

  it('すべての有料ロールのサービスは BILLING_SERVICES に定義されているべき', () => {
    expect(BILLING_SERVICES).toEqual({ livetalk: 'LiveTalk', 'quick-clip': 'Quick Clip' });
    for (const roleId of PAID_ROLES) {
      expect(Object.keys(BILLING_SERVICES)).toContain(getBillingServiceId(roleId));
    }
  });

  it('getBillingServiceId はロール ID からサービス ID を返し、有料ロール以外は undefined', () => {
    expect(getBillingServiceId('quick-clip-pro')).toBe('quick-clip');
    expect(getBillingServiceId('livetalk-standard')).toBe('livetalk');
    expect(getBillingServiceId('livetalk-user')).toBeUndefined();
    expect(getBillingServiceId('unknown')).toBeUndefined();
  });

  it('getBillingTierRoleIds はサービスの段を rank 昇順で返し、未知のサービスは空', () => {
    expect(getBillingTierRoleIds('quick-clip')).toEqual(['quick-clip-standard', 'quick-clip-pro']);
    expect(getBillingTierRoleIds('livetalk')).toEqual(['livetalk-standard']);
    expect(getBillingTierRoleIds('unknown')).toEqual([]);
  });

  it('上の段は下の段の権限を含むべき', () => {
    for (const lower of getBillingTierRoleIds('quick-clip').slice(0, 1)) {
      for (const p of (ROLES as Record<string, { permissions: string[] }>)[lower].permissions) {
        expect(ROLES['quick-clip-pro'].permissions).toContain(p);
      }
    }
  });
});

describe('compareBillingTier', () => {
  it('同じサービスで a が下の段なら負を返すべき', () => {
    expect(compareBillingTier('quick-clip-standard', 'quick-clip-pro')).toBeLessThan(0);
  });

  it('同じサービスで a が上の段なら正を返すべき', () => {
    expect(compareBillingTier('quick-clip-pro', 'quick-clip-standard')).toBeGreaterThan(0);
  });

  it('同じロールなら 0 を返すべき', () => {
    expect(compareBillingTier('livetalk-standard', 'livetalk-standard')).toBe(0);
  });

  it('有料ロールでないロールを含むと例外を投げるべき', () => {
    expect(() => compareBillingTier('admin', 'quick-clip-pro')).toThrow(
      BILLING_TIER_ERROR_MESSAGES.NOT_BILLING_ROLE
    );
    expect(() => compareBillingTier('quick-clip-pro', 'unknown-role')).toThrow(
      BILLING_TIER_ERROR_MESSAGES.NOT_BILLING_ROLE
    );
  });

  it('別サービスの有料ロールどうしなら例外を投げるべき', () => {
    expect(() => compareBillingTier('livetalk-standard', 'quick-clip-standard')).toThrow(
      BILLING_TIER_ERROR_MESSAGES.DIFFERENT_SERVICE
    );
  });
});
