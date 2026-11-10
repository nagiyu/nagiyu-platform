/**
 * Unit tests for POST /api/billing/checkout endpoint
 *
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST } from '../../../../../src/app/api/billing/checkout/route';

const mockGetSession = jest.fn();
const mockGetBillingConfig = jest.fn();
const mockCreateCheckoutSession = jest.fn();
const mockGetUserById = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

jest.mock('@nagiyu/auth-core', () => ({
  BILLING_ERROR_MESSAGES: { BILLING_DISABLED: '課金は有効になっていません' },
  canStartCheckout: jest.requireActual('../../../../../../core/src/billing/checkout-policy')
    .canStartCheckout,
  getBillingConfig: () => mockGetBillingConfig(),
  createBillingStripe: jest.fn(() => ({ marker: 'stripe' })),
  createUserRepository: jest.fn(() => ({
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
  })),
  createCheckoutSession: (...args: unknown[]) => mockCreateCheckoutSession(...args),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

function buildRequest(body: unknown) {
  return new NextRequest('https://auth.nagiyu.com/api/billing/checkout', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { host: 'auth.nagiyu.com' },
  });
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_URL = 'https://auth.nagiyu.com';
    process.env.NAGIYU_ENV = 'prod';
    mockReportErrorEvent.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ user: { id: 'u1', roles: [] } });
    mockGetBillingConfig.mockReturnValue({ secretKey: 'sk', webhookSecret: 'wh' });
    mockGetUserById.mockResolvedValue({ userId: 'u1', email: 'a@example.com', name: 'A' });
    mockCreateCheckoutSession.mockResolvedValue({ ok: true, url: 'https://checkout.test/s' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('未認証なら 401', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

    expect(response.status).toBe(401);
  });

  describe('本番以外の制限', () => {
    afterEach(() => {
      process.env.NAGIYU_ENV = 'prod';
    });

    it.each(['dev', undefined])(
      'テスト用ロールが無ければ決済画面を作らず 403 (NAGIYU_ENV=%s)',
      async (env) => {
        if (env === undefined) {
          delete process.env.NAGIYU_ENV;
        } else {
          process.env.NAGIYU_ENV = env;
        }

        const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

        expect(response.status).toBe(403);
        expect((await response.json()).error).toBe(
          'この環境では、テスト用のロールを持つ人だけが申し込めます'
        );
        expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
      }
    );

    it('テスト用ロールがあれば進める', async () => {
      process.env.NAGIYU_ENV = 'dev';
      mockGetSession.mockResolvedValue({ user: { id: 'u1', roles: ['billing-tester'] } });

      const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

      expect(response.status).toBe(200);
      expect(mockCreateCheckoutSession).toHaveBeenCalled();
    });

    it('未認証は環境によらず 401', async () => {
      process.env.NAGIYU_ENV = 'dev';
      mockGetSession.mockResolvedValue(null);

      const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

      expect(response.status).toBe(401);
    });
  });

  it('課金が無効なら 503', async () => {
    mockGetBillingConfig.mockReturnValue(null);

    const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

    expect(response.status).toBe(503);
  });

  it.each([['{'], [{}], [{ roleId: 'admin' }], [{ roleId: 1 }]])(
    '有料ロールでない・本文が不正なら 400 (%j)',
    async (body) => {
      const response = await POST(buildRequest(body));

      expect(response.status).toBe(400);
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    }
  );

  it('callbackUrl が文字列でなければ 400', async () => {
    const response = await POST(buildRequest({ roleId: 'livetalk-standard', callbackUrl: 1 }));

    expect(response.status).toBe(400);
  });

  it('ユーザーがいなければ 404', async () => {
    mockGetUserById.mockResolvedValue(null);

    const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

    expect(response.status).toBe(404);
  });

  it('検証した戻り先で Checkout Session を作り、URL を返す', async () => {
    const response = await POST(
      buildRequest({ roleId: 'livetalk-standard', callbackUrl: 'https://quick-clip.nagiyu.com/a' })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://checkout.test/s' });
    const [, , roleId, urls] = mockCreateCheckoutSession.mock.calls[0];
    expect(roleId).toBe('livetalk-standard');
    expect(urls.successUrl).toContain('/plans?checkout=success&callbackUrl=');
    expect(urls.cancelUrl).toContain(encodeURIComponent('https://quick-clip.nagiyu.com/a'));
  });

  it('許可されない戻り先は無視する', async () => {
    await POST(
      buildRequest({ roleId: 'livetalk-standard', callbackUrl: 'https://evil.example.com/' })
    );

    const [, , , urls] = mockCreateCheckoutSession.mock.calls[0];
    expect(urls.successUrl).not.toContain('callbackUrl');
    expect(urls.cancelUrl).not.toContain('evil');
  });

  it('既に契約中なら 409', async () => {
    mockCreateCheckoutSession.mockResolvedValue({
      ok: false,
      reason: 'already-subscribed-in-service',
    });

    const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

    expect(response.status).toBe(409);
  });

  it('Price が無ければ 503', async () => {
    mockCreateCheckoutSession.mockResolvedValue({ ok: false, reason: 'price-not-found' });

    const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

    expect(response.status).toBe(503);
  });

  it('有料ロールでないと判定されたら 400', async () => {
    mockCreateCheckoutSession.mockResolvedValue({ ok: false, reason: 'invalid-role' });

    const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

    expect(response.status).toBe(400);
  });

  it('想定外の失敗は 500', async () => {
    mockCreateCheckoutSession.mockRejectedValue(new Error('boom'));

    const response = await POST(buildRequest({ roleId: 'livetalk-standard' }));

    expect(response.status).toBe(500);
  });
});
