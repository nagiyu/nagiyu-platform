import type { RoleGrant, User } from '@nagiyu/common';
import {
  applyGrantChanges,
  GRANT_CHANGE_ERROR_MESSAGES,
  GrantChangeError,
  omitStripeCustomerId,
  toSelfUserView,
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

  it('roleGrants のないユーザーでも追加できる', () => {
    const result = applyGrantChanges(
      user(),
      [],
      { add: [{ roleId: 'livetalk-premium', expiresAt: FUTURE }] },
      'op',
      NOW
    );
    expect(result.roleGrants).toHaveLength(1);
    expect(result.roleGrants[0]).toMatchObject({
      roleId: 'livetalk-premium',
      source: 'manual',
      grantedBy: 'op',
      expiresAt: FUTURE,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.roleGrants[0]).not.toHaveProperty('sourceRef');
  });

  it('有料ロール以外・存在しないロールの追加は拒否する', () => {
    for (const roleId of ['admin', 'livetalk-user', 'nope']) {
      expect(() =>
        applyGrantChanges(user(), [], { add: [{ roleId, expiresAt: FUTURE }] }, 'op', NOW)
      ).toThrow(GRANT_CHANGE_ERROR_MESSAGES.INVALID_GRANT_ROLE);
    }
  });

  it('有料ロール以外の既存の権利も、期限変更と取り消しができ、残りの権利は変わらない', () => {
    const legacy = grant({ grantId: 'legacy', roleId: 'admin' });
    const extended = applyGrantChanges(
      user([legacy]),
      [],
      { extend: [{ grantId: 'legacy', expiresAt: FUTURE + 1 }] },
      'op',
      NOW
    );
    expect(extended.roleGrants[0]).toMatchObject({ roleId: 'admin', expiresAt: FUTURE + 1 });

    const revoked = applyGrantChanges(user([legacy]), [], { revoke: ['legacy'] }, 'op', NOW);
    expect(revoked.roleGrants[0]).toMatchObject({ roleId: 'admin', revokedAt: NOW });
  });

  it('入力のユーザーを書き換えない', () => {
    const original = grant();
    applyGrantChanges(user([original]), [], { revoke: ['g1'] }, 'op', NOW);
    expect(original.revokedAt).toBeUndefined();
  });

  it('期限が現在ちょうどの追加・延長は拒否する', () => {
    expect(() =>
      applyGrantChanges(
        user(),
        [],
        { add: [{ roleId: 'livetalk-premium', expiresAt: NOW }] },
        'op',
        NOW
      )
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

describe('omitStripeCustomerId', () => {
  it('Stripe の顧客 ID を外す', () => {
    const view = omitStripeCustomerId({ ...user(), stripeCustomerId: 'cus_1' });

    expect(view).not.toHaveProperty('stripeCustomerId');
    expect(view.userId).toBe('u1');
  });

  it('顧客 ID がなければそのまま返す', () => {
    const target = user();

    expect(omitStripeCustomerId(target)).toBe(target);
  });

  it('本人向けの表示からも顧客 ID を外す', () => {
    const view = toSelfUserView({ ...user([grant()]), stripeCustomerId: 'cus_1' });

    expect(view).not.toHaveProperty('stripeCustomerId');
  });
});
