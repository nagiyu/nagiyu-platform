import {
  BILLING_CLIENT_MESSAGES,
  requestCancelScheduledChange,
  requestRedirectUrl,
  requestScheduleDowngrade,
} from '../../../src/lib/billing-client';

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

describe('requestCancelScheduledChange', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('サービスの ID を送り、成功は HTTP の成否で決める', async () => {
    mockFetch({ ok: true, json: async () => ({ ok: true }) });

    expect(await requestCancelScheduledChange('quick-clip')).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledWith('/api/billing/scheduled-change/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"serviceId":"quick-clip"}',
    });
  });

  it('API のエラーメッセージを返し、通信の失敗は案内にする', async () => {
    mockFetch({ ok: false, json: async () => ({ error: '予約がありません' }) });
    expect(await requestCancelScheduledChange('quick-clip')).toEqual({
      ok: false,
      message: '予約がありません',
    });

    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    expect(await requestCancelScheduledChange('quick-clip')).toEqual({
      ok: false,
      message: BILLING_CLIENT_MESSAGES.REQUEST_FAILED,
    });
  });
});

describe('requestScheduleDowngrade', () => {
  it('plan-change に POST し、予約が作られた応答なら成功とする', async () => {
    mockFetch({ ok: true, json: async () => ({ scheduled: true, startsAt: 1 }) });

    const result = await requestScheduleDowngrade('quick-clip-standard', 'https://a.test/back');

    expect(result).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledWith('/api/billing/plan-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"roleId":"quick-clip-standard","callbackUrl":"https://a.test/back"}',
    });
  });

  it('戻り先が無ければ roleId だけ送る', async () => {
    mockFetch({ ok: true, json: async () => ({ scheduled: true }) });

    await requestScheduleDowngrade('quick-clip-standard', null);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/billing/plan-change',
      expect.objectContaining({ body: '{"roleId":"quick-clip-standard"}' })
    );
  });

  it('予約の応答でない成功は予期しない応答とし、エラーはそのまま返す', async () => {
    mockFetch({ ok: true, json: async () => ({ url: 'https://portal.test/x' }) });
    expect(await requestScheduleDowngrade('r', null)).toEqual({
      ok: false,
      message: BILLING_CLIENT_MESSAGES.UNEXPECTED,
    });

    mockFetch({ ok: false, json: async () => ({ error: '断りました' }) });
    expect(await requestScheduleDowngrade('r', null)).toEqual({ ok: false, message: '断りました' });
  });
});
