/**
 * @jest-environment node
 */
import type { User } from '@nagiyu/common';
import type { BillingOperationsStripe, UserRepository } from '@nagiyu/auth-core';
// auth-core の入口は DynamoDB 実装を経由して AWS SDK (ESM) を読み込むため、課金のロジックだけを読む。
// 課金のロジックも楽観ロックのエラー型のために @nagiyu/aws を読むので、ブラウザ向けの解決を避けて node で動かす
jest.mock('@nagiyu/auth-core', () => jest.requireActual('../../../../core/src/billing'));

import { loadPlansPageData, syncUserForPlans } from '../../../src/lib/plans-data';

const PERIOD_END_SEC = Math.floor(Date.now() / 1000) + 20 * 24 * 60 * 60;

type Options = { failPrices?: boolean; failSubscriptions?: boolean; cancelAtPeriodEnd?: boolean };

function buildStripe(options: Options = {}) {
  return {
    customers: {
      retrieve: jest.fn(async (id: string) => ({ id, metadata: { userId: 'placeholder' } })),
    },
    subscriptions: {
      list: jest.fn(async () => {
        if (options.failSubscriptions) throw new Error('stripe down');
        return {
          data: [
            {
              id: 'sub_1',
              status: 'active',
              cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
              items: {
                data: [{ current_period_end: PERIOD_END_SEC, price: { product: 'prod_1' } }],
              },
            },
          ],
        };
      }),
    },
    products: {
      listFeatures: jest.fn(async () => ({
        data: [{ entitlement_feature: { lookup_key: 'livetalk-standard' } }],
      })),
    },
    prices: {
      list: jest.fn(async () => {
        if (options.failPrices) throw new Error('stripe down');
        return {
          data: [
            {
              id: 'price_1',
              lookup_key: 'livetalk-standard',
              unit_amount: 500,
              currency: 'jpy',
              recurring: { interval: 'month', interval_count: 1 },
            },
          ],
        };
      }),
    },
    webhooks: { constructEvent: jest.fn() },
  } as unknown as BillingOperationsStripe;
}

function buildRepository(initial: User): UserRepository {
  let current = initial;
  return {
    getUserById: async (id: string) => (id === current.userId ? current : null),
    updateRolesAndGrants: async (_id: string, compute: (user: User) => Partial<User>) => {
      current = { ...current, ...compute(current) };
      return current;
    },
    updateRolesAndGrantsIfUnchanged: async (_id: string, change: Partial<User>) => {
      current = { ...current, ...change };
      return current;
    },
  } as unknown as UserRepository;
}

async function setup(withCustomer: boolean, options: Options = {}) {
  const user: User = {
    userId: 'u1',
    googleId: 'g',
    email: 'a@example.com',
    name: 'A',
    roles: [],
    createdAt: 0,
    updatedAt: 0,
  };
  const userRepository = buildRepository(user);
  const stripe = buildStripe(options);
  if (withCustomer) {
    await userRepository.updateRolesAndGrants(user.userId, () => ({ stripeCustomerId: 'cus_1' }));
    (stripe.customers.retrieve as jest.Mock).mockResolvedValue({
      id: 'cus_1',
      metadata: { userId: user.userId },
    });
  }
  return { deps: { stripe, userRepository }, userId: user.userId };
}

describe('loadPlansPageData', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('未ログインでも価格つきのカードを返し、顧客の管理は出さない', async () => {
    const { deps } = await setup(false);

    const data = await loadPlansPageData(deps, null);

    expect(data).toMatchObject({ billingEnabled: true, hasCustomer: false });
    if (!data.billingEnabled) throw new Error('unreachable');
    expect(data.cards[0]).toMatchObject({ state: 'guest', priceLabel: '月額 ¥500 (税込)' });
  });

  it('顧客を持たないログイン中のユーザーは未契約で、Stripe の契約を問い合わせない', async () => {
    const { deps, userId } = await setup(false);

    const data = await loadPlansPageData(deps, userId);

    if (!data.billingEnabled) throw new Error('unreachable');
    expect(data.hasCustomer).toBe(false);
    expect(data.cards[0]).toMatchObject({ state: 'none', canSubscribe: true });
    expect(deps.stripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it('同期してから契約中の状態を返す', async () => {
    const { deps, userId } = await setup(true);

    const data = await loadPlansPageData(deps, userId);

    if (!data.billingEnabled) throw new Error('unreachable');
    expect(data.hasCustomer).toBe(true);
    expect(data.cards[0].state).toBe('subscribed');
    const user = await deps.userRepository.getUserById(userId);
    expect(user?.roleGrants?.some((g) => g.source === 'stripe')).toBe(true);
  });

  it('契約の読み取りは同期の 1 回だけで、表示のために重ねて読まない', async () => {
    const { deps, userId } = await setup(true);

    await loadPlansPageData(deps, userId);

    expect(deps.stripe.subscriptions.list).toHaveBeenCalledTimes(1);
    expect(deps.stripe.products.listFeatures).toHaveBeenCalledTimes(1);
  });

  it('同期が契約を読めなかったときは、表示のために読み直す', async () => {
    const { deps, userId } = await setup(true);
    (deps.stripe.customers.retrieve as jest.Mock).mockRejectedValueOnce(new Error('down'));

    const data = await loadPlansPageData(deps, userId);

    if (!data.billingEnabled) throw new Error('unreachable');
    expect(data.cards[0].state).toBe('subscribed');
    expect(deps.stripe.subscriptions.list).toHaveBeenCalledTimes(1);
  });

  it('解約予約中は終了日つきで返す', async () => {
    const { deps, userId } = await setup(true, { cancelAtPeriodEnd: true });

    const data = await loadPlansPageData(deps, userId);

    if (!data.billingEnabled) throw new Error('unreachable');
    expect(data.cards[0].state).toBe('canceling');
  });

  it('Stripe の読み取りが失敗しても画面を壊さず、価格を出さず DB の状態で表示する', async () => {
    const { deps, userId } = await setup(true);
    await syncUserForPlans(deps, userId);
    (deps.stripe.subscriptions.list as jest.Mock).mockRejectedValue(new Error('down'));
    (deps.stripe.prices.list as jest.Mock).mockRejectedValue(new Error('down'));

    const data = await loadPlansPageData(deps, userId);

    if (!data.billingEnabled) throw new Error('unreachable');
    expect(data.cards[0]).toMatchObject({
      state: 'subscribed',
      priceLabel: null,
      priceFetchFailed: true,
      stateLabel: null,
    });
    expect(data.cards).toHaveLength(3);
  });

  it('価格を読めたが無いロールは、枠を出さない', async () => {
    const { deps } = await setup(false);

    const data = await loadPlansPageData(deps, null);

    if (!data.billingEnabled) throw new Error('unreachable');
    expect(data.cards.map((c) => c.roleId)).toEqual(['livetalk-standard']);
    expect(data.cards[0].priceFetchFailed).toBe(false);
  });
});

describe('syncUserForPlans', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('ユーザーがいなければ null', async () => {
    const { deps } = await setup(false);

    expect(await syncUserForPlans(deps, 'nobody')).toEqual({ user: null, subscriptions: null });
  });

  it('顧客がなければ同期せずユーザーを返す', async () => {
    const { deps, userId } = await setup(false);

    const { user, subscriptions } = await syncUserForPlans(deps, userId);

    expect(user?.userId).toBe(userId);
    expect(subscriptions).toBeNull();
    expect(deps.stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it('同期が失敗してもユーザーを返す', async () => {
    const { deps, userId } = await setup(true, { failSubscriptions: true });

    const { user, subscriptions } = await syncUserForPlans(deps, userId);

    expect(user?.userId).toBe(userId);
    expect(subscriptions).toBeNull();
  });

  it('同期が読んだ契約を返す', async () => {
    const { deps, userId } = await setup(true);

    const { subscriptions } = await syncUserForPlans(deps, userId);

    expect(subscriptions).toEqual([
      expect.objectContaining({ roleId: 'livetalk-standard', subscriptionId: 'sub_1' }),
    ]);
  });
});
