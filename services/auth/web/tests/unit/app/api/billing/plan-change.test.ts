/**
 * Unit tests for POST /api/billing/plan-change endpoint
 *
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST } from '../../../../../src/app/api/billing/plan-change/route';

const mockGetSession = jest.fn();
const mockGetBillingConfig = jest.fn();
const mockCreatePlanChangeSession = jest.fn();
const mockGetUserById = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

jest.mock('@nagiyu/auth-core', () => ({
  BILLING_ERROR_MESSAGES: { BILLING_DISABLED: '課金は有効になっていません' },
  getBillingConfig: () => mockGetBillingConfig(),
  createBillingStripe: jest.fn(() => ({ marker: 'stripe' })),
  createUserRepository: jest.fn(() => ({
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
  })),
  createPlanChangeSession: (...args: unknown[]) => mockCreatePlanChangeSession(...args),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

function buildRequest(body: unknown) {
  return new NextRequest('https://auth.nagiyu.com/api/billing/plan-change', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { host: 'auth.nagiyu.com' },
  });
}

describe('POST /api/billing/plan-change', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_URL = 'https://auth.nagiyu.com';
    mockReportErrorEvent.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ user: { id: 'u1', roles: [] } });
    mockGetBillingConfig.mockReturnValue({ secretKey: 'sk', webhookSecret: 'wh' });
    mockGetUserById.mockResolvedValue({ userId: 'u1', stripeCustomerId: 'cus_1' });
    mockCreatePlanChangeSession.mockResolvedValue({ ok: true, url: 'https://portal.test/c' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('未認証なら 401', async () => {
    mockGetSession.mockResolvedValue(null);

    expect((await POST(buildRequest({ roleId: 'quick-clip-pro' }))).status).toBe(401);
  });

  it('課金が無効なら 503', async () => {
    mockGetBillingConfig.mockReturnValue(null);

    expect((await POST(buildRequest({ roleId: 'quick-clip-pro' }))).status).toBe(503);
  });

  it.each([['{'], [{}], [{ roleId: 'admin' }], [{ roleId: 'quick-clip-pro', callbackUrl: 1 }]])(
    '本文が不正なら 400 (%j)',
    async (body) => {
      const response = await POST(buildRequest(body));

      expect(response.status).toBe(400);
      expect(mockCreatePlanChangeSession).not.toHaveBeenCalled();
    }
  );

  it('ユーザーがなければ 404', async () => {
    mockGetUserById.mockResolvedValue(null);

    expect((await POST(buildRequest({ roleId: 'quick-clip-pro' }))).status).toBe(404);
  });

  it('確認画面の URL を返し、戻り先を申し込みと同じ形で渡す', async () => {
    const response = await POST(
      buildRequest({ roleId: 'quick-clip-pro', callbackUrl: 'https://auth.nagiyu.com/back' })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://portal.test/c' });
    const [, user, roleId, urls] = mockCreatePlanChangeSession.mock.calls[0];
    expect(user.userId).toBe('u1');
    expect(roleId).toBe('quick-clip-pro');
    expect(urls.returnUrl).toBe(
      'https://auth.nagiyu.com/plans?callbackUrl=https%3A%2F%2Fauth.nagiyu.com%2Fback'
    );
    expect(urls.completionUrl).toBe(
      'https://auth.nagiyu.com/plans?checkout=success&callbackUrl=https%3A%2F%2Fauth.nagiyu.com%2Fback'
    );
  });

  it.each([
    ['invalid-role', 400],
    ['not-subscribed', 409],
    ['same-plan', 409],
    ['canceling', 409],
    ['payment-past-due', 409],
    ['change-scheduled', 409],
    ['price-not-found', 503],
  ])('断った理由 %s は %i', async (reason, status) => {
    mockCreatePlanChangeSession.mockResolvedValue({ ok: false, reason });

    const response = await POST(buildRequest({ roleId: 'quick-clip-pro' }));

    expect(response.status).toBe(status);
    expect((await response.json()).error).toEqual(expect.any(String));
  });
});
