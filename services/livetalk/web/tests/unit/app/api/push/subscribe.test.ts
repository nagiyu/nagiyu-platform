/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/push/subscribe/route';
import { getSession } from '@/lib/server/session';
import { getPushSubscriptionRepository } from '@/lib/server/repositories';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/server/repositories', () => ({
  getPushSubscriptionRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetRepo = getPushSubscriptionRepository as jest.MockedFunction<
  typeof getPushSubscriptionRepository
>;

const validSubscription = {
  endpoint: 'https://example.com/push-endpoint',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

const createRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/push/subscribe', () => {
  const put = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    mockGetSession.mockResolvedValue({
      user: { userId: 'u1', googleId: 'google-1', roles: ['livetalk-user'] },
    } as never);
    mockGetRepo.mockReturnValue({ put } as never);
  });

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it('未認証の場合は 401 を返し保存しない', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(createRequest({ subscription: validSubscription }));

    expect(response.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it('購読が不正な場合は 400 を返し保存しない', async () => {
    const response = await POST(createRequest({ subscription: { endpoint: 'x' } }));

    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('有効な購読を googleId をキーに保存して 201 を返す', async () => {
    const response = await POST(createRequest({ subscription: validSubscription }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.subscriptionId).toMatch(/^sub_[a-f0-9]{32}$/);
    expect(put).toHaveBeenCalledWith({
      UserID: 'google-1',
      SubscriptionID: body.subscriptionId,
      Endpoint: validSubscription.endpoint,
      P256dhKey: 'p256dh-key',
      AuthKey: 'auth-key',
    });
  });
});
