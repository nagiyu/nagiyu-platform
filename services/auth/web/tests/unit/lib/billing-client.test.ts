import { BILLING_CLIENT_MESSAGES, requestRedirectUrl } from '../../../src/lib/billing-client';

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  global.fetch = jest.fn().mockResolvedValue(response);
}

describe('requestRedirectUrl', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POST して返された URL を返す', async () => {
    mockFetch({ ok: true, json: async () => ({ url: 'https://stripe.test/x' }) });

    const result = await requestRedirectUrl('/api/billing/checkout', { roleId: 'r' });

    expect(result).toEqual({ ok: true, url: 'https://stripe.test/x' });
    expect(global.fetch).toHaveBeenCalledWith('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"roleId":"r"}',
    });
  });

  it('API のエラーメッセージをそのまま返す', async () => {
    mockFetch({ ok: false, json: async () => ({ error: 'このプランは既に契約中です' }) });

    expect(await requestRedirectUrl('/x', {})).toEqual({
      ok: false,
      message: 'このプランは既に契約中です',
    });
  });

  it('本文を読めないエラー応答と URL の無い成功応答は予期しない応答とする', async () => {
    mockFetch({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });
    expect(await requestRedirectUrl('/x', {})).toEqual({
      ok: false,
      message: BILLING_CLIENT_MESSAGES.UNEXPECTED,
    });

    mockFetch({ ok: true, json: async () => ({}) });
    expect(await requestRedirectUrl('/x', {})).toEqual({
      ok: false,
      message: BILLING_CLIENT_MESSAGES.UNEXPECTED,
    });
  });

  it('通信に失敗したら通信失敗の文言を返す', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));

    expect(await requestRedirectUrl('/x', {})).toEqual({
      ok: false,
      message: BILLING_CLIENT_MESSAGES.REQUEST_FAILED,
    });
  });
});
