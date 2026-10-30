/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/push/subscribe/route';
import { getSession } from '@/lib/server/session';
import { getPushSubscriptionRepository } from '@/lib/server/repositories';
import { errorReporter } from '@/lib/server/api-error-reporting';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/server/api-error-reporting', () => ({
  errorReporter: {
    report: jest.fn(),
    onError: jest.fn(() => jest.fn()),
  },
}));
/**
 * ルート読み込み時に onError へ渡された報告関数を控える。
 * beforeEach のモックのリセットで呼び出し履歴が消えるため、ここで取り出しておく。
 */
const onErrorMock = errorReporter.onError as jest.Mock;
const onErrorTitle = onErrorMock.mock.calls[0][0] as string;
const onErrorHandler = onErrorMock.mock.results[0].value as jest.Mock;

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
      user: { id: 'u1', roles: ['livetalk-user'] },
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

  it('有効な購読を セッションのユーザー ID をキーに保存して 201 を返す', async () => {
    const response = await POST(createRequest({ subscription: validSubscription }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.subscriptionId).toMatch(/^sub_[a-f0-9]{32}$/);
    expect(put).toHaveBeenCalledWith({
      userId: 'u1',
      subscriptionId: body.subscriptionId,
      endpoint: validSubscription.endpoint,
      p256dhKey: 'p256dh-key',
      authKey: 'auth-key',
    });
  });

  it('保存に失敗した場合は 500 を返し、Push 購読登録エラーとして報告する', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue({
      user: { id: 'u1', email: 'u@example.com', name: 'U', roles: ['livetalk-user'] },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
    put.mockRejectedValueOnce(new Error('db down'));
    mockGetRepo.mockReturnValue({ put } as never);

    const res = await POST(createRequest({ subscription: validSubscription }));

    expect(res.status).toBe(500);
    expect(onErrorTitle).toBe('Web API: Push 購読登録エラー');
    expect(onErrorHandler).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
    jest.restoreAllMocks();
  });
});
