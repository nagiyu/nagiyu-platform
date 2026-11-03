import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { BillingOperationsStripe, BillingPrice } from '../../../src/billing/stripe-client';
import {
  createCheckoutSession,
  createPortalSession,
  ensureStripeCustomer,
  listPlanPrices,
} from '../../../src/billing/checkout';
import { InMemoryUserRepository } from '../../../src/repositories';

const URLS = {
  successUrl: 'https://auth.test/plans?checkout=success',
  cancelUrl: 'https://auth.test/plans',
};

type Options = {
  subscriptions?: unknown[];
  features?: string[];
  prices?: BillingPrice[];
  sessionUrl?: string | null;
};

function price(lookupKey: string): BillingPrice {
  return {
    id: `price_${lookupKey}`,
    lookup_key: lookupKey,
    unit_amount: 500,
    currency: 'jpy',
    recurring: { interval: 'month', interval_count: 1 },
  };
}

function buildStripe(options: Options = {}) {
  const customersCreate = jest.fn(async () => ({ id: 'cus_new' }));
  const sessionsCreate = jest.fn(async () => ({
    url: options.sessionUrl === undefined ? 'https://checkout.test/s' : options.sessionUrl,
  }));
  const portalCreate = jest.fn(async () => ({ url: 'https://portal.test/p' }));
  const pricesList = jest.fn(async () => ({
    data: options.prices ?? [price('livetalk-premium'), { ...price('x'), lookup_key: null }],
  }));
  const stripe = {
    customers: { retrieve: jest.fn(), create: customersCreate },
    subscriptions: { list: jest.fn(async () => ({ data: options.subscriptions ?? [] })) },
    products: {
      listFeatures: jest.fn(async () => ({
        data: (options.features ?? ['livetalk-premium']).map((k) => ({
          entitlement_feature: { lookup_key: k },
        })),
      })),
    },
    webhooks: { constructEvent: jest.fn() },
    prices: { list: pricesList },
    checkout: { sessions: { create: sessionsCreate } },
    billingPortal: { sessions: { create: portalCreate } },
  } as unknown as BillingOperationsStripe;
  return { stripe, customersCreate, sessionsCreate, portalCreate, pricesList };
}

async function setupUser() {
  const repo = new InMemoryUserRepository(new InMemorySingleTableStore());
  const user = await repo.upsertUser({ googleId: 'g1', email: 'a@example.com', name: 'A' });
  return { repo, user };
}

const activeSubscription = {
  id: 'sub_1',
  status: 'active',
  items: { data: [{ current_period_end: 2_000_000_000, price: { product: 'prod_1' } }] },
};

describe('ensureStripeCustomer', () => {
  it('保存済みの顧客 ID があれば Stripe を呼ばずに返す', async () => {
    const { repo, user } = await setupUser();
    const { stripe, customersCreate } = buildStripe();

    const id = await ensureStripeCustomer(stripe, repo, { ...user, stripeCustomerId: 'cus_old' });

    expect(id).toBe('cus_old');
    expect(customersCreate).not.toHaveBeenCalled();
  });

  it('なければ冪等キーつきで顧客を作り、ユーザーに保存する', async () => {
    const { repo, user } = await setupUser();
    const { stripe, customersCreate } = buildStripe();

    const id = await ensureStripeCustomer(stripe, repo, user);

    expect(id).toBe('cus_new');
    expect(customersCreate).toHaveBeenCalledWith(
      { email: 'a@example.com', name: 'A', metadata: { userId: user.userId } },
      { idempotencyKey: `customer-${user.userId}` }
    );
    expect((await repo.getUserById(user.userId))?.stripeCustomerId).toBe('cus_new');
  });

  it('作っている間に別の顧客 ID が保存されたら、上書きせず保存済みのものを使う', async () => {
    const { repo, user } = await setupUser();
    const { stripe } = buildStripe();
    await repo.updateRolesAndGrants(user.userId, () => ({ stripeCustomerId: 'cus_winner' }));

    const id = await ensureStripeCustomer(stripe, repo, user);

    expect(id).toBe('cus_winner');
    expect((await repo.getUserById(user.userId))?.stripeCustomerId).toBe('cus_winner');
  });
});

describe('listPlanPrices', () => {
  it('lookup_key を持つ Price をロール ID で引ける形にする', async () => {
    const { stripe, pricesList } = buildStripe();

    const prices = await listPlanPrices(stripe);

    expect(pricesList).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        lookup_keys: expect.arrayContaining(['livetalk-premium']),
      })
    );
    expect([...prices.keys()]).toEqual(['livetalk-premium']);
  });
});

describe('createCheckoutSession', () => {
  it('有料ロールでなければ顧客も作らず拒否する', async () => {
    const { repo, user } = await setupUser();
    const { stripe, customersCreate } = buildStripe();

    const result = await createCheckoutSession(
      { stripe, userRepository: repo },
      user,
      'admin',
      URLS
    );

    expect(result).toEqual({ ok: false, reason: 'invalid-role' });
    expect(customersCreate).not.toHaveBeenCalled();
  });

  it('同じロールの有効な契約があれば拒否する', async () => {
    const { repo, user } = await setupUser();
    const { stripe, sessionsCreate } = buildStripe({ subscriptions: [activeSubscription] });

    const result = await createCheckoutSession(
      { stripe, userRepository: repo },
      user,
      'livetalk-premium',
      URLS
    );

    expect(result).toEqual({ ok: false, reason: 'already-subscribed' });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('別のロールの契約だけなら申し込める', async () => {
    const { repo, user } = await setupUser();
    const { stripe } = buildStripe({
      subscriptions: [activeSubscription],
      features: ['quick-clip-premium'],
    });

    const result = await createCheckoutSession(
      { stripe, userRepository: repo },
      user,
      'livetalk-premium',
      URLS
    );

    expect(result).toEqual({ ok: true, url: 'https://checkout.test/s' });
  });

  it('Price がなければ拒否する', async () => {
    const { repo, user } = await setupUser();
    const { stripe } = buildStripe({ prices: [] });

    const result = await createCheckoutSession(
      { stripe, userRepository: repo },
      user,
      'livetalk-premium',
      URLS
    );

    expect(result).toEqual({ ok: false, reason: 'price-not-found' });
  });

  it('決められた内容で Checkout Session を作る', async () => {
    const { repo, user } = await setupUser();
    const { stripe, sessionsCreate } = buildStripe();

    await createCheckoutSession({ stripe, userRepository: repo }, user, 'livetalk-premium', URLS);

    const metadata = { userId: user.userId, roleId: 'livetalk-premium' };
    expect(sessionsCreate).toHaveBeenCalledWith({
      mode: 'subscription',
      customer: 'cus_new',
      client_reference_id: user.userId,
      line_items: [{ price: 'price_livetalk-premium', quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      locale: 'ja',
      success_url: URLS.successUrl,
      cancel_url: URLS.cancelUrl,
    });
  });

  it('Session に URL がなければ例外にする', async () => {
    const { repo, user } = await setupUser();
    const { stripe } = buildStripe({ sessionUrl: null });

    await expect(
      createCheckoutSession({ stripe, userRepository: repo }, user, 'livetalk-premium', URLS)
    ).rejects.toThrow('Checkout Session の URL を取得できませんでした');
  });
});

describe('createPortalSession', () => {
  it('顧客がなければ作らない', async () => {
    const { stripe, portalCreate } = buildStripe();

    const result = await createPortalSession(stripe, {}, 'https://auth.test/plans');

    expect(result).toEqual({ ok: false, reason: 'no-customer' });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it('顧客と戻り先を渡して URL を返す', async () => {
    const { stripe, portalCreate } = buildStripe();

    const result = await createPortalSession(
      stripe,
      { stripeCustomerId: 'cus_1' },
      'https://auth.test/plans'
    );

    expect(result).toEqual({ ok: true, url: 'https://portal.test/p' });
    expect(portalCreate).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://auth.test/plans',
    });
  });
});
