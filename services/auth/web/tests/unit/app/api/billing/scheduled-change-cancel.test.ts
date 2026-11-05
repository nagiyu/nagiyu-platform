/**
 * Unit tests for POST /api/billing/scheduled-change/cancel endpoint
 *
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST } from '../../../../../src/app/api/billing/scheduled-change/cancel/route';

const mockGetSession = jest.fn();
const mockGetBillingConfig = jest.fn();
const mockCancelScheduledChange = jest.fn();
const mockGetUserById = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

jest.mock('@nagiyu/auth-core', () => ({
  BILLING_ERROR_MESSAGES: { BILLING_DISABLED: '課金は有効になっていません' },
  getBillingConfig: () => mockGetBillingConfig(),
  createBillingStripe: jest.fn(() => ({ marker: 'stripe' })),
  createUserRepository: jest.fn(() => ({
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
  })),
  cancelScheduledChange: (...args: unknown[]) => mockCancelScheduledChange(...args),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

function buildRequest(body: unknown) {
  return new NextRequest('https://auth.nagiyu.com/api/billing/scheduled-change/cancel', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { host: 'auth.nagiyu.com' },
  });
}

describe('POST /api/billing/scheduled-change/cancel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReportErrorEvent.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ user: { id: 'u1', roles: [] } });
    mockGetBillingConfig.mockReturnValue({ secretKey: 'sk', webhookSecret: 'wh' });
    mockGetUserById.mockResolvedValue({ userId: 'u1', stripeCustomerId: 'cus_1' });
    mockCancelScheduledChange.mockResolvedValue({ ok: true });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('未認証なら 401', async () => {
    mockGetSession.mockResolvedValue(null);

    expect((await POST(buildRequest({ serviceId: 'quick-clip' }))).status).toBe(401);
  });

  it('課金が無効なら 503', async () => {
    mockGetBillingConfig.mockReturnValue(null);

    expect((await POST(buildRequest({ serviceId: 'quick-clip' }))).status).toBe(503);
  });

  it.each([['{'], [{}], [{ serviceId: 'unknown' }], [{ serviceId: 1 }]])(
    'サービス ID が不正なら 400 (%j)',
    async (body) => {
      const response = await POST(buildRequest(body));

      expect(response.status).toBe(400);
      expect(mockCancelScheduledChange).not.toHaveBeenCalled();
    }
  );

  it('ユーザーがなければ 404', async () => {
    mockGetUserById.mockResolvedValue(null);

    expect((await POST(buildRequest({ serviceId: 'quick-clip' }))).status).toBe(404);
  });

  it('取り消せたら ok を返す。対象はセッションのユーザーとサービス ID だけで決める', async () => {
    const response = await POST(buildRequest({ serviceId: 'quick-clip', scheduleId: 'sched_x' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const [, user, serviceId] = mockCancelScheduledChange.mock.calls[0];
    expect(user.userId).toBe('u1');
    expect(serviceId).toBe('quick-clip');
  });

  it('予約がなければ 409', async () => {
    mockCancelScheduledChange.mockResolvedValue({ ok: false, reason: 'no-scheduled-change' });

    expect((await POST(buildRequest({ serviceId: 'quick-clip' }))).status).toBe(409);
  });
});
