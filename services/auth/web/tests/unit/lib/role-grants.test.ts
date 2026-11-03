import type { RoleGrant, User } from '@nagiyu/common';
import {
  applyGrantChanges,
  GRANT_CHANGE_ERROR_MESSAGES,
  GrantChangeError,
} from '../../../src/lib/role-grants';

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 1000;

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return {
    grantId: 'g1',
    roleId: 'admin',
    source: 'manual',
    expiresAt: FUTURE,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function user(roleGrants?: RoleGrant[]): User {
  return {
    userId: 'u1',
    googleId: 'g',
    email: 'e@example.com',
    name: 'N',
    roles: [],
    ...(roleGrants ? { roleGrants } : {}),
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('applyGrantChanges', () => {
  it('変更がなければ手動ロールだけを返し、権利は変えない', () => {
    const original = grant();
    const result = applyGrantChanges(user([original]), ['admin'], undefined, 'op', NOW);
    expect(result).toEqual({ roles: ['admin'], roleGrants: [original] });
  });

  it('roleGrants のない旧形式のユーザーでも追加できる', () => {
    const result = applyGrantChanges(
      user(),
      [],
      { add: [{ roleId: 'admin', expiresAt: FUTURE }] },
      'op',
      NOW
    );
    expect(result.roleGrants).toHaveLength(1);
    expect(result.roleGrants[0]).toMatchObject({
      roleId: 'admin',
      source: 'manual',
      grantedBy: 'op',
      expiresAt: FUTURE,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.roleGrants[0]).not.toHaveProperty('sourceRef');
  });

  it('入力のユーザーを書き換えない', () => {
    const original = grant();
    applyGrantChanges(user([original]), [], { revoke: ['g1'] }, 'op', NOW);
    expect(original.revokedAt).toBeUndefined();
  });

  it('期限が現在ちょうどの追加・延長は拒否する', () => {
    expect(() =>
      applyGrantChanges(user(), [], { add: [{ roleId: 'admin', expiresAt: NOW }] }, 'op', NOW)
    ).toThrow(GRANT_CHANGE_ERROR_MESSAGES.EXPIRES_AT_NOT_FUTURE);
    expect(() =>
      applyGrantChanges(
        user([grant()]),
        [],
        { extend: [{ grantId: 'g1', expiresAt: NOW }] },
        'op',
        NOW
      )
    ).toThrow(GrantChangeError);
  });

  it('期限切れで取り消していない手動の権利は延長できる', () => {
    const result = applyGrantChanges(
      user([grant({ expiresAt: NOW - 1 })]),
      [],
      { extend: [{ grantId: 'g1', expiresAt: FUTURE }] },
      'op',
      NOW
    );
    expect(result.roleGrants[0]).toMatchObject({ expiresAt: FUTURE, updatedAt: NOW });
  });
});
