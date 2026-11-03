import type { RoleGrant, User } from '@nagiyu/common';
import {
  buildStripeUnlink,
  StripeCustomerNotLinkedError,
} from '../../../src/lib/stripe-customer-unlink';

const NOW = 1_700_000_000_000;

function grant(overrides: Partial<RoleGrant>): RoleGrant {
  return {
    grantId: 'g',
    roleId: 'livetalk-premium',
    source: 'stripe',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function user(overrides: Partial<User>): User {
  return {
    userId: 'u1',
    googleId: 'g',
    email: 'e@example.com',
    name: 'N',
    roles: ['admin'],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('buildStripeUnlink', () => {
  it('対応が無ければ StripeCustomerNotLinkedError を投げる', () => {
    expect(() => buildStripeUnlink(user({}), NOW)).toThrow(StripeCustomerNotLinkedError);
  });

  it('対応を null にし、Stripe 由来の有効な権利だけを取り消す', () => {
    const active = grant({ grantId: 'active', expiresAt: NOW + 1000 });
    const noExpiry = grant({ grantId: 'noExpiry' });
    const expired = grant({ grantId: 'expired', expiresAt: NOW - 1 });
    const revoked = grant({ grantId: 'revoked', revokedAt: 5, expiresAt: NOW + 1000 });
    const manual = grant({ grantId: 'manual', source: 'manual', expiresAt: NOW + 1000 });

    const result = buildStripeUnlink(
      user({
        stripeCustomerId: 'cus_1',
        roleGrants: [active, noExpiry, expired, revoked, manual],
      }),
      NOW
    );

    expect(result.stripeCustomerId).toBeNull();
    expect(result.roleGrants).toEqual([
      { ...active, revokedAt: NOW, updatedAt: NOW },
      { ...noExpiry, revokedAt: NOW, updatedAt: NOW },
      expired,
      revoked,
      manual,
    ]);
  });

  it('権利を持たないユーザーでも対応を外せる', () => {
    expect(buildStripeUnlink(user({ stripeCustomerId: 'cus_1' }), NOW)).toEqual({
      stripeCustomerId: null,
      roleGrants: [],
    });
  });

  it('入力のユーザーを書き換えない', () => {
    const active = grant({ grantId: 'active' });
    buildStripeUnlink(user({ stripeCustomerId: 'cus_1', roleGrants: [active] }), NOW);

    expect(active.revokedAt).toBeUndefined();
  });
});
