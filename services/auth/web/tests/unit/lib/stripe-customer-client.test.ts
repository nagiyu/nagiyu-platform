import {
  STRIPE_CUSTOMER_CLIENT_MESSAGES,
  unlinkStripeCustomer,
} from '../../../src/lib/stripe-customer-client';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('unlinkStripeCustomer', () => {
  it('DELETE で呼び、更新後のユーザーを返す', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ userId: 'u 1' }) });

    const result = await unlinkStripeCustomer('u 1');

    expect(mockFetch).toHaveBeenCalledWith('/api/users/u%201/stripe-customer', {
      method: 'DELETE',
    });
    expect(result).toEqual({ ok: true, user: { userId: 'u 1' } });
  });

  it('API のエラー文言をそのまま返す', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: '失敗' }) });

    expect(await unlinkStripeCustomer('u1')).toEqual({ ok: false, message: '失敗' });
  });

  it('エラー文言が無い応答は既定の文言にする', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('invalid');
      },
    });

    expect(await unlinkStripeCustomer('u1')).toEqual({
      ok: false,
      message: STRIPE_CUSTOMER_CLIENT_MESSAGES.UNLINK_FAILED,
    });
  });

  it('通信に失敗したら通信失敗の文言にする', async () => {
    mockFetch.mockRejectedValue(new Error('network'));

    expect(await unlinkStripeCustomer('u1')).toEqual({
      ok: false,
      message: STRIPE_CUSTOMER_CLIENT_MESSAGES.REQUEST_FAILED,
    });
  });
});
