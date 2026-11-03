import { InMemorySingleTableStore, OptimisticLockError } from '@nagiyu/aws';
import type { RoleGrant } from '@nagiyu/common';
import { GRACE_PERIOD_MS, extractCustomerId, syncStripeCustomer } from '../../../src/billing/sync';
import type { BillingStripe, BillingSubscription } from '../../../src/billing/stripe-client';
import { InMemoryUserRepository } from '../../../src/repositories';
import { ROLES_AND_GRANTS_MAX_ATTEMPTS } from '../../../src/repositories/user-repository';

const NOW = 1_700_000_000_000;
const PERIOD_END_SEC = Math.floor(NOW / 1000) + 30 * 24 * 60 * 60;
const EXPECTED_EXPIRES_AT = PERIOD_END_SEC * 1000 + GRACE_PERIOD_MS;

type FakeOptions = {
  customer?: { id: string; deleted?: boolean; metadata?: Record<string, string> | null };
  subscriptions?: BillingSubscription[];
  features?: Record<string, string[]>;
};

function subscription(
  id: string,
  status: string,
  productId: string | { id: string } = 'prod_live',
  periodEnd = PERIOD_END_SEC
): BillingSubscription {
  return {
    id,
    status,
    items: { data: [{ current_period_end: periodEnd, price: { product: productId } }] },
  };
}

function buildStripe(options: FakeOptions): BillingStripe & { listFeatures: jest.Mock } {
  const listFeatures = jest.fn(async (productId: string) => ({
    data: (options.features?.[productId] ?? []).map((lookup_key) => ({
      entitlement_feature: { lookup_key },
    })),
  }));
  return {
    customers: {
      retrieve: jest.fn(
        async () => options.customer ?? { id: 'cus_1', metadata: { userId: 'u1' } }
      ),
    },
    subscriptions: { list: jest.fn(async () => ({ data: options.subscriptions ?? [] })) },
    products: { listFeatures },
    webhooks: { constructEvent: jest.fn() },
    listFeatures,
  };
}

async function setup(stripeCustomerId: string | null = 'cus_1') {
  const store = new InMemorySingleTableStore();
  const repo = new InMemoryUserRepository(store);
  const created = await repo.upsertUser({ googleId: 'g1', email: 'a@example.com', name: 'A' });
  if (stripeCustomerId !== null) {
    // 顧客の対応を保存する更新経路はまだ無いため、保存済みの項目に属性を足す
    const key = { userId: created.userId };
    store.putByKey(key, { ...store.getByKey(key), StripeCustomerId: stripeCustomerId });
  }
  return { repo, store, userId: created.userId };
}

describe('syncStripeCustomer', () => {
  let generated = 0;
  const generateId = () => `grant-${++generated}`;
  beforeEach(() => {
    generated = 0;
  });

  function deps(stripe: BillingStripe, repo: InMemoryUserRepository) {
    return { stripe, userRepository: repo, now: () => NOW, generateId };
  }

  it('有効な契約の有料ロールを権利として作り、期限は請求期間の終わり + 3 日にする', async () => {
    const { repo, userId } = await setup();
    const stripe = buildStripe({
      customer: { id: 'cus_1', metadata: { userId } },
      subscriptions: [subscription('sub_1', 'active')],
      features: { prod_live: ['livetalk-premium'] },
    });

    const result = await syncStripeCustomer(deps(stripe, repo), 'cus_1');

    expect(result).toEqual({ synced: true, changed: true });
    const user = await repo.getUserById(userId);
    expect(user?.roleGrants).toEqual([
      {
        grantId: 'grant-1',
        roleId: 'livetalk-premium',
        source: 'stripe',
        sourceRef: 'sub_1',
        expiresAt: EXPECTED_EXPIRES_AT,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });

  it('同じ同期を繰り返しても書き込まず、結果も変わらない', async () => {
    const { repo, userId } = await setup();
    const stripe = buildStripe({
      customer: { id: 'cus_1', metadata: { userId } },
      subscriptions: [subscription('sub_1', 'trialing')],
      features: { prod_live: ['livetalk-premium'] },
    });
    await syncStripeCustomer(deps(stripe, repo), 'cus_1');
    const before = await repo.getUserById(userId);
    const spy = jest.spyOn(repo, 'updateRolesAndGrantsIfUnchanged');

    const result = await syncStripeCustomer(deps(stripe, repo), 'cus_1');

    expect(result).toEqual({ synced: true, changed: false });
    expect(spy).not.toHaveBeenCalled();
    expect(await repo.getUserById(userId)).toEqual(before);
  });

  it('past_due の契約も有効として扱い、それ以外の状態は無視する', async () => {
    const { repo, userId } = await setup();
    const stripe = buildStripe({
      customer: { id: 'cus_1', metadata: { userId } },
      subscriptions: [
        subscription('sub_pd', 'past_due', 'prod_a'),
        subscription('sub_c', 'canceled', 'prod_b'),
        subscription('sub_i', 'incomplete', 'prod_b'),
      ],
      features: { prod_a: ['livetalk-premium'], prod_b: ['quick-clip-premium'] },
    });

    await syncStripeCustomer(deps(stripe, repo), 'cus_1');

    const user = await repo.getUserById(userId);
    expect(user?.roleGrants?.map((g) => [g.roleId, g.sourceRef])).toEqual([
      ['livetalk-premium', 'sub_pd'],
    ]);
  });

  it('契約が終わったら Stripe 由来の権利を取り消し、手動の権利は残す', async () => {
    const { repo, userId } = await setup();
    const manual: RoleGrant = {
      grantId: 'm1',
      roleId: 'livetalk-premium',
      source: 'manual',
      expiresAt: NOW + 1000,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repo.updateRolesAndGrants(userId, () => ({
      roleGrants: [
        manual,
        {
          grantId: 's1',
          roleId: 'livetalk-premium',
          source: 'stripe',
          sourceRef: 'sub_1',
          expiresAt: EXPECTED_EXPIRES_AT,
          createdAt: NOW - 1,
          updatedAt: NOW - 1,
        },
      ],
    }));
    const stripe = buildStripe({
      customer: { id: 'cus_1', metadata: { userId } },
      subscriptions: [subscription('sub_1', 'canceled')],
    });

    await syncStripeCustomer(deps(stripe, repo), 'cus_1');

    const grants = (await repo.getUserById(userId))?.roleGrants;
    expect(grants?.[0]).toEqual(manual);
    expect(grants?.[1]).toMatchObject({ grantId: 's1', revokedAt: NOW });
  });

  describe('同期中に別の書き込みが割り込んだとき', () => {
    /** Stripe を読んでいる最中に、別のハンドラーがユーザーを書き換えたことにする */
    async function interruptOnList(
      stripe: ReturnType<typeof buildStripe>,
      store: InMemorySingleTableStore,
      userId: string,
      responses: BillingSubscription[][]
    ) {
      let calls = 0;
      (stripe.subscriptions.list as jest.Mock).mockImplementation(async () => {
        const data = responses[Math.min(calls, responses.length - 1)];
        calls += 1;
        const raw = store.getByKey({ userId }) as Record<string, unknown>;
        store.putByKey({ userId }, { ...raw, UpdatedAt: (raw.UpdatedAt as number) + calls });
        return { data };
      });
    }

    it('読み直して、新しい Stripe の状態で書き直す', async () => {
      const store = new InMemorySingleTableStore();
      const repo = new InMemoryUserRepository(store);
      const created = await repo.upsertUser({ googleId: 'g1', email: 'a@example.com', name: 'A' });
      const key = { userId: created.userId };
      store.putByKey(key, { ...store.getByKey(key), StripeCustomerId: 'cus_1' });
      const stripe = buildStripe({
        customer: { id: 'cus_1', metadata: { userId: created.userId } },
        features: { prod_old: ['livetalk-premium'], prod_new: ['quick-clip-premium'] },
      });
      // 1 回目の読み取りの最中に割り込まれ、2 回目では契約が変わっている
      let interrupted = false;
      (stripe.subscriptions.list as jest.Mock).mockImplementation(async () => {
        if (!interrupted) {
          interrupted = true;
          const raw = store.getByKey(key) as Record<string, unknown>;
          store.putByKey(key, { ...raw, UpdatedAt: (raw.UpdatedAt as number) + 1 });
          return { data: [subscription('sub_old', 'active', 'prod_old')] };
        }
        return { data: [subscription('sub_new', 'active', 'prod_new')] };
      });

      const result = await syncStripeCustomer(deps(stripe, repo), 'cus_1');

      expect(result).toEqual({ synced: true, changed: true });
      expect(stripe.subscriptions.list).toHaveBeenCalledTimes(2);
      const grants = (await repo.getUserById(created.userId))?.roleGrants;
      expect(grants?.map((g) => [g.roleId, g.sourceRef])).toEqual([
        ['quick-clip-premium', 'sub_new'],
      ]);
    });

    it('競合が解けなければ上限回数で OptimisticLockError にする', async () => {
      const { repo, store, userId } = await setup();
      const stripe = buildStripe({
        customer: { id: 'cus_1', metadata: { userId } },
        features: { prod_live: ['livetalk-premium'] },
      });
      await interruptOnList(stripe, store, userId, [[subscription('sub_1', 'active')]]);

      await expect(syncStripeCustomer(deps(stripe, repo), 'cus_1')).rejects.toBeInstanceOf(
        OptimisticLockError
      );
      expect(stripe.subscriptions.list).toHaveBeenCalledTimes(ROLES_AND_GRANTS_MAX_ATTEMPTS);
    });
  });

  it('同じ商品の機能の取得は 1 回にまとめる', async () => {
    const { repo, userId } = await setup();
    const stripe = buildStripe({
      customer: { id: 'cus_1', metadata: { userId } },
      subscriptions: [subscription('sub_1', 'active'), subscription('sub_2', 'active')],
      features: { prod_live: ['livetalk-premium'] },
    });

    await syncStripeCustomer(deps(stripe, repo), 'cus_1');

    expect(stripe.listFeatures).toHaveBeenCalledTimes(1);
  });

  it('展開された商品オブジェクトの ID も扱える', async () => {
    const { repo, userId } = await setup();
    const stripe = buildStripe({
      customer: { id: 'cus_1', metadata: { userId } },
      subscriptions: [subscription('sub_1', 'active', { id: 'prod_x' })],
      features: { prod_x: ['quick-clip-premium'] },
    });

    await syncStripeCustomer(deps(stripe, repo), 'cus_1');

    expect(stripe.listFeatures).toHaveBeenCalledWith('prod_x', expect.anything());
    expect((await repo.getUserById(userId))?.roleGrants?.[0].roleId).toBe('quick-clip-premium');
  });

  it('有料ロールでない lookup_key は無視する', async () => {
    const { repo, userId } = await setup();
    const stripe = buildStripe({
      customer: { id: 'cus_1', metadata: { userId } },
      subscriptions: [subscription('sub_1', 'active')],
      features: { prod_live: ['admin', 'unknown-feature'] },
    });

    const result = await syncStripeCustomer(deps(stripe, repo), 'cus_1');

    expect(result).toEqual({ synced: true, changed: false });
    expect((await repo.getUserById(userId))?.roleGrants).toBeUndefined();
  });

  it('顧客が削除済みなら何もしない', async () => {
    const { repo } = await setup();
    const stripe = buildStripe({ customer: { id: 'cus_1', deleted: true } });

    expect(await syncStripeCustomer(deps(stripe, repo), 'cus_1')).toEqual({
      synced: false,
      reason: 'customer-deleted',
    });
    expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it.each([
    ['metadata が無い', { id: 'cus_1', metadata: null }],
    ['userId が無い', { id: 'cus_1', metadata: {} }],
    ['ユーザーがいない', { id: 'cus_1', metadata: { userId: 'missing' } }],
  ])('%s ときは何もしない', async (_name, customer) => {
    const { repo } = await setup();
    const stripe = buildStripe({ customer });

    expect(await syncStripeCustomer(deps(stripe, repo), 'cus_1')).toEqual({
      synced: false,
      reason: 'user-not-found',
    });
    expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it.each([
    ['別の顧客 ID', 'cus_other'],
    ['顧客 ID なし', null],
  ])('ユーザーの顧客 ID が一致しない (%s) ときは何もしない', async (_name, saved) => {
    const { repo, userId } = await setup(saved);
    const stripe = buildStripe({
      customer: { id: 'cus_1', metadata: { userId } },
      subscriptions: [subscription('sub_1', 'active')],
      features: { prod_live: ['livetalk-premium'] },
    });

    expect(await syncStripeCustomer(deps(stripe, repo), 'cus_1')).toEqual({
      synced: false,
      reason: 'customer-mismatch',
    });
    expect((await repo.getUserById(userId))?.roleGrants).toBeUndefined();
  });

  it('Stripe の失敗はそのまま投げる', async () => {
    const { repo } = await setup();
    const stripe = buildStripe({});
    (stripe.customers.retrieve as jest.Mock).mockRejectedValue(new Error('stripe down'));

    await expect(syncStripeCustomer(deps(stripe, repo), 'cus_1')).rejects.toThrow('stripe down');
  });

  it('省略した now と generateId は実際の時刻と UUID を使う', async () => {
    const { repo, userId } = await setup();
    const futureSec = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const stripe = buildStripe({
      customer: { id: 'cus_1', metadata: { userId } },
      subscriptions: [subscription('sub_1', 'active', 'prod_live', futureSec)],
      features: { prod_live: ['livetalk-premium'] },
    });

    await syncStripeCustomer({ stripe, userRepository: repo }, 'cus_1');

    const grant = (await repo.getUserById(userId))?.roleGrants?.[0];
    expect(grant?.grantId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('extractCustomerId', () => {
  it.each([
    ['文字列', { customer: 'cus_1' }, 'cus_1'],
    ['展開されたオブジェクト', { customer: { id: 'cus_2' } }, 'cus_2'],
    ['空文字', { customer: '' }, null],
    ['customer なし', {}, null],
    ['null', { customer: null }, null],
    ['id のないオブジェクト', { customer: {} }, null],
    ['空の id', { customer: { id: '' } }, null],
  ])('customer が%sの場合', (_name, object, expected) => {
    expect(extractCustomerId({ data: { object } })).toBe(expected);
  });

  it('オブジェクトでない data.object は null', () => {
    expect(extractCustomerId({ data: { object: 'x' } })).toBeNull();
    expect(extractCustomerId({ data: { object: null } })).toBeNull();
  });
});

describe('listEntitledSubscriptions', () => {
  it('解約の予約と請求期間の終わりを返す', async () => {
    const { listEntitledSubscriptions } = await import('../../../src/billing/sync');
    const canceling: BillingSubscription = {
      ...subscription('sub_a', 'active'),
      cancel_at_period_end: true,
    };
    const cancelAt: BillingSubscription = {
      ...subscription('sub_b', 'trialing'),
      cancel_at: PERIOD_END_SEC + 100,
    };
    const stripe = buildStripe({
      subscriptions: [canceling, cancelAt, subscription('sub_c', 'active')],
      features: { prod_live: ['livetalk-premium'] },
    });

    const result = await listEntitledSubscriptions(stripe, 'cus_1');

    expect(result.map((r) => [r.subscriptionId, r.endsAt])).toEqual([
      ['sub_a', PERIOD_END_SEC * 1000],
      ['sub_b', (PERIOD_END_SEC + 100) * 1000],
      ['sub_c', null],
    ]);
  });
});
