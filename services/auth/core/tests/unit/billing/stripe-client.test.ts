const mockStripe = {
  customers: { retrieve: jest.fn(), create: jest.fn() },
  prices: { list: jest.fn() },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  subscriptions: { list: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
};

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => mockStripe),
}));

import Stripe from 'stripe';
import { createBillingStripe, getBillingConfig } from '../../../src/billing/stripe-client';

describe('getBillingConfig', () => {
  it('両方の鍵があれば設定を返す', () => {
    expect(getBillingConfig({ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'whsec' })).toEqual({
      secretKey: 'sk',
      webhookSecret: 'whsec',
    });
  });

  it.each([
    [{}],
    [{ STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' }],
    [{ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: '' }],
    [{ STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: 'whsec' }],
    [{ STRIPE_SECRET_KEY: 'PLACEHOLDER_SECRET_KEY', STRIPE_WEBHOOK_SECRET: 'whsec' }],
    [{ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'PLACEHOLDER_WEBHOOK_SECRET' }],
  ])('鍵が空か無ければ無効 (null) とする: %j', (env) => {
    expect(getBillingConfig(env)).toBeNull();
  });
});

describe('createBillingStripe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SDK の呼び出しに引数をそのまま渡す', async () => {
    mockStripe.customers.retrieve.mockResolvedValue({ id: 'cus_1' });
    mockStripe.subscriptions.list.mockResolvedValue({ data: [] });
    mockStripe.webhooks.constructEvent.mockReturnValue({ type: 't' });

    const client = createBillingStripe('sk_test');

    expect(Stripe).toHaveBeenCalledWith('sk_test');
    await client.customers.retrieve('cus_1');
    await client.subscriptions.list({ customer: 'cus_1', status: 'all', limit: 100 });
    client.webhooks.constructEvent('body', 'sig', 'whsec');

    expect(mockStripe.customers.retrieve).toHaveBeenCalledWith('cus_1');
    expect(mockStripe.subscriptions.list).toHaveBeenCalledWith({
      customer: 'cus_1',
      status: 'all',
      limit: 100,
    });
    expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith('body', 'sig', 'whsec');
  });

  it('申し込みと契約の管理の呼び出しにも引数をそのまま渡す', async () => {
    const client = createBillingStripe('sk_test');

    await client.customers.create(
      { email: 'a@example.com', name: 'A', metadata: { userId: 'u1' } },
      { idempotencyKey: 'customer-u1' }
    );
    await client.prices.list({ lookup_keys: ['k'], active: true, limit: 100 });
    await client.checkout.sessions.create({ mode: 'subscription' } as never);
    await client.billingPortal.sessions.create({
      customer: 'cus_1',
      return_url: 'https://x/plans',
    });

    expect(mockStripe.customers.create).toHaveBeenCalledWith(
      { email: 'a@example.com', name: 'A', metadata: { userId: 'u1' } },
      { idempotencyKey: 'customer-u1' }
    );
    expect(mockStripe.prices.list).toHaveBeenCalledWith({
      lookup_keys: ['k'],
      active: true,
      limit: 100,
    });
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({ mode: 'subscription' });
    expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://x/plans',
    });
  });
});
