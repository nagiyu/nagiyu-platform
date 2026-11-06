import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { BillingOperationsStripe, BillingPrice } from '../../../src/billing/stripe-client';
import {
  cancelScheduledChange,
  createCheckoutSession,
  createPlanChangeSession,
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
  const releaseSchedule = jest.fn(async () => ({}));
  const createSchedule = jest.fn(async () => ({
    id: 'sched_new',
    phases: [
      {
        start_date: 1_000_000_000,
        end_date: 2_000_000_000,
        items: [{ price: 'price_quick-clip-pro', quantity: 1 }],
      },
    ],
  }));
  const updateSchedule = jest.fn(async (): Promise<unknown> => ({}));
  const pricesList = jest.fn(async () => ({
    data: options.prices ?? [price('livetalk-standard'), { ...price('x'), lookup_key: null }],
  }));
  const stripe = {
    customers: { retrieve: jest.fn(), create: customersCreate },
    subscriptions: { list: jest.fn(async () => ({ data: options.subscriptions ?? [] })) },
    webhooks: { constructEvent: jest.fn() },
    prices: { list: pricesList },
    checkout: { sessions: { create: sessionsCreate } },
    billingPortal: { sessions: { create: portalCreate } },
    subscriptionSchedules: {
      create: createSchedule,
      update: updateSchedule,
      release: releaseSchedule,
    },
  } as unknown as BillingOperationsStripe;
  return {
    stripe,
    customersCreate,
    sessionsCreate,
    portalCreate,
    pricesList,
    releaseSchedule,
    createSchedule,
    updateSchedule,
  };
}

async function setupUser() {
  const repo = new InMemoryUserRepository(new InMemorySingleTableStore());
  const user = await repo.upsertUser({ googleId: 'g1', email: 'a@example.com', name: 'A' });
  return { repo, user };
}

function activeSubscription(
  lookupKey: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'sub_1',
    status: 'active',
    ...extra,
    items: {
      data: [
        {
          id: 'si_1',
          current_period_end: 2_000_000_000,
          price: { id: `price_${lookupKey}`, lookup_key: lookupKey },
        },
      ],
    },
  };
}

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
      { idempotencyKey: `customer-${user.userId}-${user.updatedAt}` }
    );
    expect((await repo.getUserById(user.userId))?.stripeCustomerId).toBe('cus_new');
  });

  it('対応を外した後は別の冪等キーで作り直し、前の顧客を返さない', async () => {
    // 更新時刻はミリ秒なので、速い環境でも手順ごとに時刻がずれるように進める
    let now = 1_800_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const { repo, user } = await setupUser();
      const { stripe, customersCreate } = buildStripe();
      now += 1000;
      await ensureStripeCustomer(stripe, repo, user);
      now += 1000;
      const unlinked = await repo.updateRolesAndGrants(user.userId, () => ({
        stripeCustomerId: null,
      }));
      now += 1000;

      await ensureStripeCustomer(stripe, repo, unlinked);

      const keys = customersCreate.mock.calls.map(([, options]) => options.idempotencyKey);
      expect(keys).toEqual([
        `customer-${user.userId}-${user.updatedAt}`,
        `customer-${user.userId}-${unlinked.updatedAt}`,
      ]);
      expect(keys[0]).not.toBe(keys[1]);
    } finally {
      nowSpy.mockRestore();
    }
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
        lookup_keys: expect.arrayContaining(['livetalk-standard']),
        expand: ['data.product'],
      })
    );
    expect([...prices.keys()]).toEqual(['livetalk-standard']);
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

  it.each([
    ['同じ段', 'livetalk-standard', 'livetalk-standard'],
    ['同じサービスの別の段', 'quick-clip-standard', 'quick-clip-pro'],
  ])('%sの有効な契約があれば拒否する', async (_label, subscribed, requested) => {
    const { repo, user } = await setupUser();
    const { stripe, sessionsCreate } = buildStripe({
      subscriptions: [activeSubscription(subscribed)],
      prices: [price(requested)],
    });

    const result = await createCheckoutSession(
      { stripe, userRepository: repo },
      user,
      requested,
      URLS
    );

    expect(result).toEqual({ ok: false, reason: 'already-subscribed-in-service' });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('別のサービスの契約だけなら申し込める', async () => {
    const { repo, user } = await setupUser();
    const { stripe } = buildStripe({
      subscriptions: [activeSubscription('quick-clip-standard')],
    });

    const result = await createCheckoutSession(
      { stripe, userRepository: repo },
      user,
      'livetalk-standard',
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
      'livetalk-standard',
      URLS
    );

    expect(result).toEqual({ ok: false, reason: 'price-not-found' });
  });

  it('決められた内容で Checkout Session を作る', async () => {
    const { repo, user } = await setupUser();
    const { stripe, sessionsCreate } = buildStripe();

    await createCheckoutSession({ stripe, userRepository: repo }, user, 'livetalk-standard', URLS);

    const metadata = { userId: user.userId, roleId: 'livetalk-standard' };
    expect(sessionsCreate).toHaveBeenCalledWith({
      mode: 'subscription',
      customer: 'cus_new',
      client_reference_id: user.userId,
      line_items: [{ price: 'price_livetalk-standard', quantity: 1 }],
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
      createCheckoutSession({ stripe, userRepository: repo }, user, 'livetalk-standard', URLS)
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

const PLAN_URLS = {
  returnUrl: 'https://auth.test/plans',
  completionUrl: 'https://auth.test/plans?checkout=success',
};

const LOWER_SCHEDULE = {
  id: 'sched_1',
  status: 'active',
  phases: [
    { start_date: 1_000_000_000, items: [{ price: 'price_quick-clip-pro' }] },
    { start_date: 2_000_000_000, items: [{ price: 'price_quick-clip-standard' }] },
  ],
};

describe('createPlanChangeSession', () => {
  const prices = [price('quick-clip-standard'), price('quick-clip-pro')];
  const user = { stripeCustomerId: 'cus_1' };

  it.each([
    ['有料ロールでない', 'admin', user, [], 'invalid-role'],
    ['顧客がない', 'quick-clip-pro', {}, [], 'not-subscribed'],
    [
      '同じサービスの契約がない',
      'quick-clip-pro',
      user,
      [activeSubscription('livetalk-standard')],
      'not-subscribed',
    ],
    ['今の段と同じ', 'quick-clip-pro', user, [activeSubscription('quick-clip-pro')], 'same-plan'],
    [
      '解約を予約中',
      'quick-clip-pro',
      user,
      [activeSubscription('quick-clip-standard', { cancel_at_period_end: true })],
      'canceling',
    ],
    [
      '下げを予約中',
      'quick-clip-standard',
      user,
      [activeSubscription('quick-clip-pro', { schedule: LOWER_SCHEDULE })],
      'change-scheduled',
    ],
  ])('断る: %s', async (_name, roleId, target, subscriptions, reason) => {
    const { stripe, portalCreate } = buildStripe({ subscriptions, prices });

    const result = await createPlanChangeSession(stripe, target, roleId, PLAN_URLS);

    expect(result).toEqual({ ok: false, reason });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it('cancel_at だけが付いた契約は解約の予約中として断る', async () => {
    const { stripe, portalCreate } = buildStripe({
      subscriptions: [activeSubscription('quick-clip-standard', { cancel_at: 2_100_000_000 })],
      prices,
    });

    const result = await createPlanChangeSession(stripe, user, 'quick-clip-pro', PLAN_URLS);

    expect(result).toEqual({ ok: false, reason: 'canceling' });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it('支払いが遅れている契約は断る', async () => {
    const { stripe, portalCreate } = buildStripe({
      subscriptions: [activeSubscription('quick-clip-standard', { status: 'past_due' })],
      prices,
    });

    const result = await createPlanChangeSession(stripe, user, 'quick-clip-pro', PLAN_URLS);

    expect(result).toEqual({ ok: false, reason: 'payment-past-due' });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it('試用中の契約は切り替えられる', async () => {
    const { stripe, portalCreate } = buildStripe({
      subscriptions: [activeSubscription('quick-clip-standard', { status: 'trialing' })],
      prices,
    });

    const result = await createPlanChangeSession(stripe, user, 'quick-clip-pro', PLAN_URLS);

    expect(result.ok).toBe(true);
    expect(portalCreate).toHaveBeenCalled();
  });

  it('行き先の価格がなければ断る', async () => {
    const { stripe, portalCreate } = buildStripe({
      subscriptions: [activeSubscription('quick-clip-standard')],
      prices: [price('quick-clip-standard')],
    });

    const result = await createPlanChangeSession(stripe, user, 'quick-clip-pro', PLAN_URLS);

    expect(result).toEqual({ ok: false, reason: 'price-not-found' });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it('契約の品目を行き先の価格に差し替える確認画面の URL を返す', async () => {
    const { stripe, portalCreate } = buildStripe({
      subscriptions: [activeSubscription('quick-clip-standard')],
      prices,
    });

    const result = await createPlanChangeSession(stripe, user, 'quick-clip-pro', PLAN_URLS);

    expect(result).toEqual({ ok: true, kind: 'portal', url: 'https://portal.test/p' });
    expect(portalCreate).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: PLAN_URLS.returnUrl,
      flow_data: {
        type: 'subscription_update_confirm',
        subscription_update_confirm: {
          subscription: 'sub_1',
          items: [{ id: 'si_1', price: 'price_quick-clip-pro', quantity: 1 }],
        },
        after_completion: { type: 'redirect', redirect: { return_url: PLAN_URLS.completionUrl } },
      },
    });
  });
});

describe('createPlanChangeSession (下げ)', () => {
  const prices = [price('quick-clip-standard'), price('quick-clip-pro')];
  const user = { stripeCustomerId: 'cus_1' };
  const subscriptions = [activeSubscription('quick-clip-pro')];

  it('Portal へ送らず、期末に下の段へ切り替わる予約を作る', async () => {
    const { stripe, portalCreate, createSchedule, updateSchedule, releaseSchedule } = buildStripe({
      subscriptions,
      prices,
    });

    const result = await createPlanChangeSession(stripe, user, 'quick-clip-standard', PLAN_URLS);

    expect(result).toEqual({ ok: true, kind: 'scheduled', startsAt: 2_000_000_000_000 });
    expect(portalCreate).not.toHaveBeenCalled();
    expect(createSchedule).toHaveBeenCalledWith({ from_subscription: 'sub_1' });
    expect(updateSchedule).toHaveBeenCalledWith('sched_new', {
      phases: [
        {
          start_date: 1_000_000_000,
          end_date: 2_000_000_000,
          items: [{ price: 'price_quick-clip-pro', quantity: 1 }],
          proration_behavior: 'none',
        },
        {
          items: [{ price: 'price_quick-clip-standard', quantity: 1 }],
          duration: { interval: 'month', interval_count: 1 },
          proration_behavior: 'none',
        },
      ],
      end_behavior: 'release',
      proration_behavior: 'none',
      metadata: { createdBy: 'nagiyu-auth' },
    });
    expect(releaseSchedule).not.toHaveBeenCalled();
  });

  it('予約の更新に失敗したら release して例外を伝える', async () => {
    const { stripe, updateSchedule, releaseSchedule } = buildStripe({ subscriptions, prices });
    updateSchedule.mockRejectedValue(new Error('update failed'));

    await expect(
      createPlanChangeSession(stripe, user, 'quick-clip-standard', PLAN_URLS)
    ).rejects.toThrow('update failed');
    expect(releaseSchedule).toHaveBeenCalledWith('sched_new');
  });

  it('release も失敗したときは、元の例外を伝える', async () => {
    const { stripe, updateSchedule, releaseSchedule } = buildStripe({ subscriptions, prices });
    updateSchedule.mockRejectedValue(new Error('update failed'));
    releaseSchedule.mockRejectedValue(new Error('release failed'));

    await expect(
      createPlanChangeSession(stripe, user, 'quick-clip-standard', PLAN_URLS)
    ).rejects.toThrow('update failed');
  });

  it('作成直後に現在の期間がなければ release して例外を伝える', async () => {
    const { stripe, createSchedule, updateSchedule, releaseSchedule } = buildStripe({
      subscriptions,
      prices,
    });
    createSchedule.mockResolvedValue({ id: 'sched_new', phases: [] });

    await expect(
      createPlanChangeSession(stripe, user, 'quick-clip-standard', PLAN_URLS)
    ).rejects.toThrow();
    expect(updateSchedule).not.toHaveBeenCalled();
    expect(releaseSchedule).toHaveBeenCalledWith('sched_new');
  });

  it('行き先の価格に請求期間がなければ予約を作らず断る', async () => {
    const { stripe, createSchedule } = buildStripe({
      subscriptions,
      prices: [price('quick-clip-pro'), { ...price('quick-clip-standard'), recurring: null }],
    });

    const result = await createPlanChangeSession(stripe, user, 'quick-clip-standard', PLAN_URLS);

    expect(result).toEqual({ ok: false, reason: 'price-not-found' });
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('上げでは予約を作らない', async () => {
    const { stripe, createSchedule } = buildStripe({
      subscriptions: [activeSubscription('quick-clip-standard')],
      prices,
    });

    await createPlanChangeSession(stripe, user, 'quick-clip-pro', PLAN_URLS);

    expect(createSchedule).not.toHaveBeenCalled();
  });
});

describe('cancelScheduledChange', () => {
  const user = { stripeCustomerId: 'cus_1' };

  it('同じサービスの契約の予約を release する', async () => {
    const { stripe, releaseSchedule } = buildStripe({
      subscriptions: [activeSubscription('quick-clip-pro', { schedule: LOWER_SCHEDULE })],
    });

    const result = await cancelScheduledChange(stripe, user, 'quick-clip');

    expect(result).toEqual({ ok: true });
    expect(releaseSchedule).toHaveBeenCalledWith('sched_1');
  });

  it('release が失敗したら例外を伝える', async () => {
    const { stripe, releaseSchedule } = buildStripe({
      subscriptions: [activeSubscription('quick-clip-pro', { schedule: LOWER_SCHEDULE })],
    });
    releaseSchedule.mockRejectedValue(new Error('stripe down'));

    await expect(cancelScheduledChange(stripe, user, 'quick-clip')).rejects.toThrow('stripe down');
  });

  it.each([
    ['予約がない', [activeSubscription('quick-clip-pro')], 'cus_1'],
    [
      '別のサービスの予約だけ',
      [activeSubscription('livetalk-standard', { schedule: LOWER_SCHEDULE })],
      'cus_1',
    ],
    ['顧客がない', [activeSubscription('quick-clip-pro', { schedule: LOWER_SCHEDULE })], undefined],
  ])('release しない: %s', async (_name, subscriptions, customerId) => {
    const { stripe, releaseSchedule } = buildStripe({ subscriptions });

    const result = await cancelScheduledChange(
      stripe,
      { stripeCustomerId: customerId },
      'quick-clip'
    );

    expect(result).toEqual({ ok: false, reason: 'no-scheduled-change' });
    expect(releaseSchedule).not.toHaveBeenCalled();
  });
});
