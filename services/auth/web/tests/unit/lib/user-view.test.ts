import type { RoleGrant, User } from '@nagiyu/common';
import { omitStripeCustomerId, toSelfUserView } from '../../../src/lib/user-view';

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return {
    grantId: 'g1',
    roleId: 'admin',
    source: 'manual',
    expiresAt: 1_700_000_001_000,
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
