import {
  ROLE_GRANT_SOURCES,
  getEffectiveRoles,
  getRoleGrantStatus,
  isRoleGrantActive,
  type RoleGrant,
} from '../../../src/auth/role-grants';

const NOW = 1_700_000_000_000;

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return {
    grantId: 'g1',
    roleId: 'stock-user',
    source: 'manual',
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...overrides,
  };
}

describe('ROLE_GRANT_SOURCES', () => {
  it('manual と stripe を含む', () => {
    expect(ROLE_GRANT_SOURCES).toEqual(['manual', 'stripe']);
  });
});

describe('getRoleGrantStatus / isRoleGrantActive', () => {
  it('期限内で取り消しがなければ有効', () => {
    const g = grant({ expiresAt: NOW + 1 });
    expect(getRoleGrantStatus(g, NOW)).toBe('active');
    expect(isRoleGrantActive(g, NOW)).toBe(true);
  });

  it('期限がなければ有効', () => {
    expect(isRoleGrantActive(grant(), NOW)).toBe(true);
  });

  it('期限ちょうどは期限切れ', () => {
    const g = grant({ expiresAt: NOW });
    expect(getRoleGrantStatus(g, NOW)).toBe('expired');
    expect(isRoleGrantActive(g, NOW)).toBe(false);
  });

  it('期限を過ぎていれば期限切れ', () => {
    expect(getRoleGrantStatus(grant({ expiresAt: NOW - 1 }), NOW)).toBe('expired');
  });

  it('取り消し済みは取り消し', () => {
    const g = grant({ expiresAt: NOW + 1000, revokedAt: NOW - 1 });
    expect(getRoleGrantStatus(g, NOW)).toBe('revoked');
    expect(isRoleGrantActive(g, NOW)).toBe(false);
  });

  it('取り消し済みで期限も過ぎていれば取り消しを優先する', () => {
    expect(getRoleGrantStatus(grant({ expiresAt: NOW - 1, revokedAt: NOW - 2 }), NOW)).toBe(
      'revoked'
    );
  });
});

describe('getEffectiveRoles', () => {
  it('権利がなければ手動ロールをそのまま返す', () => {
    expect(getEffectiveRoles(['admin'], [], NOW)).toEqual(['admin']);
  });

  it('有効な権利のロールを手動ロールの後ろに足す', () => {
    const grants = [grant({ roleId: 'stock-user', expiresAt: NOW + 1 })];
    expect(getEffectiveRoles(['admin'], grants, NOW)).toEqual(['admin', 'stock-user']);
  });

  it('期限切れと取り消しの権利は含めない', () => {
    const grants = [
      grant({ grantId: 'a', roleId: 'stock-user', expiresAt: NOW - 1 }),
      grant({ grantId: 'b', roleId: 'livetalk-user', expiresAt: NOW + 1, revokedAt: NOW - 1 }),
    ];
    expect(getEffectiveRoles(['admin'], grants, NOW)).toEqual(['admin']);
  });

  it('手動ロールと重複するロール、権利どうしで重複するロールは 1 つにする', () => {
    const grants = [
      grant({ grantId: 'a', roleId: 'admin', expiresAt: NOW + 1 }),
      grant({ grantId: 'b', roleId: 'stock-user', expiresAt: NOW + 1 }),
      grant({ grantId: 'c', roleId: 'stock-user', expiresAt: NOW + 5 }),
    ];
    expect(getEffectiveRoles(['admin'], grants, NOW)).toEqual(['admin', 'stock-user']);
  });

  it('入力を変更しない', () => {
    const roles = ['admin'];
    getEffectiveRoles(roles, [grant({ expiresAt: NOW + 1 })], NOW);
    expect(roles).toEqual(['admin']);
  });
});
