/**
 * @jest-environment node
 */
import { POST } from '@/app/api/notify/subscribe/route';
import { GET as getVapidKey } from '@/app/api/notify/vapid-key/route';
import { createPushSubscriptionRepository } from '@nagiyu/admin-core';
import { getSession } from '@/lib/auth/session';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(),
}));

jest.mock(
  '@nagiyu/admin-core',
  () => ({
    createPushSubscriptionRepository: jest.fn(),
  }),
  { virtual: true }
);

jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockCreateRepository = createPushSubscriptionRepository as jest.MockedFunction<
  typeof createPushSubscriptionRepository
>;

const validSubscription = {
  endpoint: 'https://example.com/push-endpoint',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

const createRequest = (body: unknown) =>
  new Request('http://localhost/api/notify/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/notify/subscribe', () => {
  const save = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_IN_MEMORY_DB = 'true';
    mockGetSession.mockResolvedValue({
      user: { id: 'user-1', roles: ['admin'] },
    } as never);
    mockCreateRepository.mockReturnValue({ save } as never);
    save.mockResolvedValue({ subscriptionId: 'sub-1' });
  });

  afterEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
  });

  it('購読をそのまま受け取り、200 と subscriptionId を返す', async () => {
    const response = await POST(createRequest(validSubscription));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, subscriptionId: 'sub-1' });
    expect(save).toHaveBeenCalledWith({ userId: 'user-1', subscription: validSubscription });
  });

  it.each([
    ['鍵が空', { endpoint: 'https://example.com/e', keys: { p256dh: '', auth: '' } }],
    ['endpoint が URL 形式でない', { endpoint: 'not-a-url', keys: { p256dh: 'a', auth: 'b' } }],
    ['keys が無い', { endpoint: 'https://example.com/e' }],
  ])('購読が不正（%s）な場合は 400 を返し保存しない', async (_label, body) => {
    const response = await POST(createRequest(body));

    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('GET /api/notify/vapid-key', () => {
  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
  });

  it('公開鍵が設定されていれば 200 で返す', async () => {
    process.env.VAPID_PUBLIC_KEY = 'public-key';

    const response = await getVapidKey();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: 'public-key' });
  });

  it('公開鍵が未設定なら 500 を返す', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await getVapidKey();

    expect(response.status).toBe(500);
    spy.mockRestore();
  });
});
