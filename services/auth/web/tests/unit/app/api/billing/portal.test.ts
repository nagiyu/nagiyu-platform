/**
 * Unit tests for POST /api/billing/portal endpoint
 *
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST } from '../../../../../src/app/api/billing/portal/route';

const mockGetSession = jest.fn();
const mockGetBillingConfig = jest.fn();
const mockCreatePortalSession = jest.fn();
const mockGetUserById = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

jest.mock('@nagiyu/auth-core', () => ({
  BILLING_ERROR_MESSAGES: { BILLING_DISABLED: '課金は有効になっていません' },
  getBillingConfig: () => mockGetBillingConfig(),
  createBillingStripe: jest.fn(() => ({ marker: 'stripe' })),
  createUserRepository: jest.fn(() => ({
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
  })),
  createPortalSession: (...args: unknown[]) => mockCreatePortalSession(...args),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

function buildRequest(body?: unknown) {
  return new NextRequest('https://auth.nagiyu.com/api/billing/portal', {
    method: 'POST',
    body:
      body === undefined || typeof body === 'string'
        ? (body as string | undefined)
        : JSON.stringify(body),
    headers: { host: 'auth.nagiyu.com' },
  });
}

describe('POST /api/billing/portal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_URL = 'https://auth.nagiyu.com';
    mockReportErrorEvent.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ user: { id: 'u1', roles: [] } });
    mockGetBillingConfig.mockReturnValue({ secretKey: 'sk', webhookSecret: 'wh' });
    mockGetUserById.mockResolvedValue({ userId: 'u1', stripeCustomerId: 'cus_1' });
    mockCreatePortalSession.mockResolvedValue({ ok: true, url: 'https://portal.test/p' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('未認証なら 401', async () => {
    mockGetSession.mockResolvedValue(null);

    expect((await POST(buildRequest({}))).status).toBe(401);
  });

  it('課金が無効なら 503', async () => {
    mockGetBillingConfig.mockReturnValue(null);

    expect((await POST(buildRequest({}))).status).toBe(503);
  });

  it('callbackUrl が文字列でなければ 400', async () => {
    expect((await POST(buildRequest({ callbackUrl: 1 }))).status).toBe(400);
  });

  it('ユーザーがいなければ 404', async () => {
    mockGetUserById.mockResolvedValue(null);

    expect((await POST(buildRequest({}))).status).toBe(404);
  });

  it('顧客がなければ 404', async () => {
    mockCreatePortalSession.mockResolvedValue({ ok: false, reason: 'no-customer' });

    expect((await POST(buildRequest({}))).status).toBe(404);
  });

  it('戻り先なしでもプランの画面に戻る URL で作る', async () => {
    const response = await POST(buildRequest());

    expect(await response.json()).toEqual({ url: 'https://portal.test/p' });
    expect(mockCreatePortalSession.mock.calls[0][2]).toBe('https://auth.nagiyu.com/plans');
  });

  it.each([['{'], ['null'], [[]]])(
    '本文が壊れている・オブジェクトでなくても、戻り先なしとして扱う (%j)',
    async (body) => {
      const response = await POST(buildRequest(body));

      expect(response.status).toBe(200);
      expect(mockCreatePortalSession.mock.calls[0][2]).toBe('https://auth.nagiyu.com/plans');
    }
  );

  it('検証した戻り先を return_url に引き継ぐ。許可されない戻り先は無視する', async () => {
    await POST(buildRequest({ callbackUrl: 'https://quick-clip.nagiyu.com/a' }));
    await POST(buildRequest({ callbackUrl: 'https://evil.example.com/' }));

    expect(mockCreatePortalSession.mock.calls[0][2]).toBe(
      `https://auth.nagiyu.com/plans?callbackUrl=${encodeURIComponent('https://quick-clip.nagiyu.com/a')}`
    );
    expect(mockCreatePortalSession.mock.calls[1][2]).toBe('https://auth.nagiyu.com/plans');
  });

  it('想定外の失敗は 500', async () => {
    mockCreatePortalSession.mockRejectedValue(new Error('boom'));

    expect((await POST(buildRequest({}))).status).toBe(500);
  });
});
