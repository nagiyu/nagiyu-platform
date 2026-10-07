import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { NextRequest } from 'next/server';
import {
  createVapidPublicKeyRoute,
  createPushSubscribeRoute,
  type CreatePushSubscribeRouteOptions,
  validatePushSubscription,
  createSubscriptionId,
} from '../../src/push';

describe('createVapidPublicKeyRoute', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.VAPID_PUBLIC_KEY;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.VAPID_PUBLIC_KEY;
  });

  it('VAPID公開鍵が設定されている場合は200と公開鍵を返す', async () => {
    process.env.VAPID_PUBLIC_KEY = 'test-vapid-public-key';
    const GET = createVapidPublicKeyRoute();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      publicKey: 'test-vapid-public-key',
    });
  });

  it('VAPID公開鍵が未設定の場合は500エラーを返す', async () => {
    const GET = createVapidPublicKeyRoute();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'VAPID公開鍵が設定されていません',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('VAPID_PUBLIC_KEY is not configured');
  });
});

describe('validatePushSubscription', () => {
  it('有効なサブスクリプション情報の場合は true を返す', () => {
    expect(
      validatePushSubscription({
        endpoint: 'https://example.com/push-endpoint',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
      })
    ).toBe(true);
  });

  it('endpoint が不正な URL の場合は false を返す', () => {
    expect(
      validatePushSubscription({
        endpoint: 'invalid-url',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
      })
    ).toBe(false);
  });

  it('keys.auth が欠けている場合は false を返す', () => {
    expect(
      validatePushSubscription({
        endpoint: 'https://example.com/push-endpoint',
        keys: {
          p256dh: 'test-p256dh-key',
        },
      })
    ).toBe(false);
  });
});

describe('createSubscriptionId', () => {
  it('サブスクリプションIDを sub_ プレフィックス付きで生成する', async () => {
    const subscriptionId = await createSubscriptionId('https://example.com/push-endpoint');

    expect(subscriptionId).toMatch(/^sub_[a-f0-9]{32}$/);
  });

  it('同じ endpoint からは同じ ID が生成される', async () => {
    const endpoint = 'https://example.com/push-endpoint';
    const subscriptionId1 = await createSubscriptionId(endpoint);
    const subscriptionId2 = await createSubscriptionId(endpoint);

    expect(subscriptionId1).toBe(subscriptionId2);
  });
});

describe('createPushSubscribeRoute', () => {
  const createRequest = (body: unknown) =>
    new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const validSubscription = {
    endpoint: 'https://example.com/push-endpoint',
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
    },
  };

  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = 'test-vapid-public-key';
    process.env.VAPID_PRIVATE_KEY = 'test-vapid-private-key';
  });

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it('未認証時は401を返す', async () => {
    const POST = createPushSubscribeRoute({
      getSession: async () => null,
    });

    const response = await POST(
      createRequest({ subscription: validSubscription }) as unknown as NextRequest
    );

    expect(response.status).toBe(401);
  });

  it('有効なリクエスト時は201とsubscriptionIdを返す', async () => {
    const POST = createPushSubscribeRoute({
      getSession: async () =>
        ({
          user: {
            userId: 'user-1',
            email: 'test@example.com',
            roles: ['stock-user'],
          },
        }) as never,
      requiredPermission: 'stocks:write-own',
    });

    const response = await POST(
      createRequest({ subscription: validSubscription }) as unknown as NextRequest
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.subscriptionId).toMatch(/^sub_[a-f0-9]{32}$/);
  });

  describe('onSubscribe フック', () => {
    const session = {
      user: { userId: 'user-1', email: 'test@example.com', roles: ['stock-user'] },
    };
    type HookSession = typeof session;
    type Hook = NonNullable<CreatePushSubscribeRouteOptions<HookSession>['onSubscribe']>;
    const createHook = () => jest.fn<Hook>();

    it('検証後にセッション・購読・ID を渡して呼び出し、201 を返す', async () => {
      const onSubscribe = createHook().mockResolvedValue(undefined);
      const POST = createPushSubscribeRoute({
        getSession: async () => session,
        onSubscribe,
      });

      const response = await POST(
        createRequest({ subscription: validSubscription }) as unknown as NextRequest
      );
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(onSubscribe).toHaveBeenCalledTimes(1);
      expect(onSubscribe).toHaveBeenCalledWith({
        session,
        subscription: validSubscription,
        subscriptionId: body.subscriptionId,
      });
    });

    it('購読が不正な場合は呼び出さない', async () => {
      const onSubscribe = createHook();
      const POST = createPushSubscribeRoute({
        getSession: async () => session,
        onSubscribe,
      });

      const response = await POST(
        createRequest({ subscription: { endpoint: 'invalid' } }) as unknown as NextRequest
      );

      expect(response.status).toBe(400);
      expect(onSubscribe).not.toHaveBeenCalled();
    });

    it('VAPID 鍵が未設定の場合は呼び出さない', async () => {
      delete process.env.VAPID_PRIVATE_KEY;
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const onSubscribe = createHook();
      const POST = createPushSubscribeRoute({
        getSession: async () => session,
        onSubscribe,
      });

      const response = await POST(
        createRequest({ subscription: validSubscription }) as unknown as NextRequest
      );

      expect(response.status).toBe(500);
      expect(onSubscribe).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('フックが例外を投げた場合は 500 を返す', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const POST = createPushSubscribeRoute({
        getSession: async () => session,
        onSubscribe: async () => {
          throw new Error('保存失敗');
        },
      });

      const response = await POST(
        createRequest({ subscription: validSubscription }) as unknown as NextRequest
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('INTERNAL_ERROR');
      consoleErrorSpy.mockRestore();
    });
  });
});
