import { act, renderHook, waitFor } from '@testing-library/react';
import { usePushSubscription } from '../../src/hooks/usePushSubscription';

type MockPushSubscription = {
  unsubscribe: jest.Mock;
  toJSON?: () => Record<string, unknown>;
};

type SetupOptions = {
  hasNotification?: boolean;
  hasServiceWorker?: boolean;
  hasPushManager?: boolean;
  permission?: NotificationPermission;
  existingRegistration?: 'default' | 'none';
  existingSubscription?: MockPushSubscription | null;
  newSubscription?: MockPushSubscription;
};

const setupBrowser = (options: SetupOptions = {}) => {
  const {
    hasNotification = true,
    hasServiceWorker = true,
    hasPushManager = true,
    permission = 'default',
    existingRegistration = 'default',
    existingSubscription = null,
    newSubscription,
  } = options;

  const created: MockPushSubscription = newSubscription ?? {
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    toJSON: () => ({ endpoint: 'new' }),
  };

  const subscribeFn = jest.fn().mockResolvedValue(created);
  const getSubscriptionFn = jest.fn().mockResolvedValue(existingSubscription);
  const registration = {
    pushManager: {
      getSubscription: getSubscriptionFn,
      subscribe: subscribeFn,
    },
  };

  // existingRegistration === 'none' なら getRegistration は null、register は新規登録を返す
  const getRegistrationFn = jest
    .fn()
    .mockResolvedValue(existingRegistration === 'none' ? null : registration);
  const registerFn = jest.fn().mockResolvedValue(registration);

  if (hasNotification) {
    (window as unknown as { Notification: unknown }).Notification = {
      requestPermission: jest.fn().mockResolvedValue(permission),
      permission,
    };
  } else {
    delete (window as unknown as { Notification?: unknown }).Notification;
  }

  if (hasServiceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: registerFn,
        getRegistration: getRegistrationFn,
      },
    });
  } else {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });
  }

  if (hasPushManager) {
    (window as unknown as { PushManager: unknown }).PushManager = function () {};
  } else {
    delete (window as unknown as { PushManager?: unknown }).PushManager;
  }

  return {
    subscribeFn,
    getSubscriptionFn,
    getRegistrationFn,
    registerFn,
    created,
  };
};

const originalFetch = global.fetch;

beforeEach(() => {
  // 公開鍵の取得と購読情報の送信を実ネットワークに向けないためのスタブ
  global.fetch = jest
    .fn()
    .mockImplementation(async (url: string) =>
      url === '/api/push/vapid-public-key'
        ? ({ ok: true, json: async () => ({ publicKey: 'SGVsbG8' }) } as Response)
        : ({ ok: true } as Response)
    );
});

afterEach(() => {
  global.fetch = originalFetch;
  delete (window as unknown as { Notification?: unknown }).Notification;
  delete (window as unknown as { PushManager?: unknown }).PushManager;
});

describe('usePushSubscription', () => {
  describe('初期状態', () => {
    it('未サポートブラウザでは supported=false', async () => {
      setupBrowser({ hasNotification: false });
      const { result } = renderHook(() => usePushSubscription());
      expect(result.current.supported).toBe(false);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('サポート対応ブラウザでは supported=true', async () => {
      setupBrowser();
      const { result } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(result.current.supported).toBe(true));
    });

    it('初回レンダリングはサーバーと同じ値 (supported=false, permission=default, ready=false)', () => {
      setupBrowser({ permission: 'granted' });
      const seen: Array<{ supported: boolean; permission: string; ready: boolean }> = [];
      renderHook(() => {
        const state = usePushSubscription();
        if (seen.length === 0) {
          seen.push({
            supported: state.supported,
            permission: state.permission,
            ready: state.ready,
          });
        }
        return state;
      });
      expect(seen[0]).toEqual({ supported: false, permission: 'default', ready: false });
    });

    it('初期判定が終わると ready=true になる', async () => {
      setupBrowser();
      const { result } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(result.current.ready).toBe(true));
    });

    it('未サポートブラウザでも ready=true になる', async () => {
      setupBrowser({ hasNotification: false });
      const { result } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.supported).toBe(false);
    });

    it('既存 subscription の取得に失敗しても ready=true になる', async () => {
      const { getRegistrationFn } = setupBrowser();
      getRegistrationFn.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.subscribed).toBe(false);
    });

    it('初期判定中にアンマウントしても状態を更新しない', async () => {
      const { getRegistrationFn } = setupBrowser();
      let resolveRegistration: (value: null) => void = () => {};
      getRegistrationFn.mockReturnValue(
        new Promise<null>((resolve) => {
          resolveRegistration = resolve;
        })
      );
      const { result, unmount } = renderHook(() => usePushSubscription());
      unmount();
      await act(async () => {
        resolveRegistration(null);
      });
      expect(result.current.ready).toBe(false);
    });

    it('オプションを省略しても動作する', async () => {
      setupBrowser();
      const { result } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(result.current.supported).toBe(true));
    });

    it('既存 subscription があれば subscribed=true になる', async () => {
      const existing: MockPushSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      setupBrowser({ existingSubscription: existing });
      const { result } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(result.current.subscribed).toBe(true));
    });

    it('既存 subscription がなければ subscribed=false のまま', async () => {
      setupBrowser({ existingSubscription: null });
      const { result } = renderHook(() => usePushSubscription());
      // 初期化処理が走った後も subscribed は false のまま
      await waitFor(() => {
        expect(result.current.subscribed).toBe(false);
      });
    });

    it('permission は Notification.permission を反映する', async () => {
      setupBrowser({ permission: 'denied' });
      const { result } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(result.current.permission).toBe('denied'));
    });
  });

  describe('subscribe()', () => {
    it('成功時に subscribed=true になり、既定の公開鍵取得先と送信先を使う', async () => {
      setupBrowser({ permission: 'granted' });
      const { result } = renderHook(() => usePushSubscription());

      await act(async () => {
        await result.current.subscribe();
      });

      expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/push/vapid-public-key');
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/push/subscribe', expect.anything());
      expect(result.current.subscribed).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it('購読した PushSubscription を返す', async () => {
      const { created } = setupBrowser({ permission: 'granted' });
      const { result } = renderHook(() => usePushSubscription());

      let returned: PushSubscription | undefined;
      await act(async () => {
        returned = await result.current.subscribe();
      });

      expect(returned).toBe(created);
    });

    it('エンドポイントと bodyShape を指定すると、その公開鍵取得先と送信先を使う', async () => {
      const { created } = setupBrowser({ permission: 'granted' });
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: 'SGVsbG8' }) })
        .mockResolvedValueOnce({ ok: true });
      const { result } = renderHook(() =>
        usePushSubscription({
          vapidPublicKeyEndpoint: '/api/notify/vapid-key',
          subscribeEndpoint: '/api/notify/subscribe',
          bodyShape: 'raw',
        })
      );

      await act(async () => {
        await result.current.subscribe();
      });

      expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/notify/vapid-key');
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/notify/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(created.toJSON?.()),
      });
    });

    it('失敗時に error が設定され throw される', async () => {
      setupBrowser({ permission: 'denied' });
      const { result } = renderHook(() => usePushSubscription());

      await act(async () => {
        await expect(result.current.subscribe()).rejects.toThrow();
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.subscribed).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it('公開鍵の取得に失敗した場合は error が設定される', async () => {
      setupBrowser({ permission: 'granted' });
      global.fetch = jest.fn().mockResolvedValue({ ok: false } as Response);
      const { result } = renderHook(() => usePushSubscription());

      await act(async () => {
        await expect(result.current.subscribe()).rejects.toThrow();
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.subscribed).toBe(false);
    });

    it('swPath が subscribePush に伝搬される', async () => {
      const { registerFn } = setupBrowser({
        permission: 'granted',
        existingRegistration: 'none',
      });
      const { result } = renderHook(() => usePushSubscription({ swPath: '/custom-sw.js' }));

      await act(async () => {
        await result.current.subscribe();
      });

      expect(registerFn).toHaveBeenCalledWith('/custom-sw.js');
    });
  });

  describe('unsubscribe()', () => {
    it('既存 subscription があれば unsubscribe を呼び subscribed=false にする', async () => {
      const existing: MockPushSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      setupBrowser({ existingSubscription: existing });
      const { result } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(result.current.subscribed).toBe(true));

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(existing.unsubscribe).toHaveBeenCalled();
      expect(result.current.subscribed).toBe(false);
    });

    it('購読解除に失敗した場合は error が設定され throw される', async () => {
      const existing: MockPushSubscription = {
        unsubscribe: jest.fn().mockRejectedValue(new Error('unsubscribe failed')),
      };
      setupBrowser({ existingSubscription: existing });
      const { result } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(result.current.subscribed).toBe(true));

      await act(async () => {
        await expect(result.current.unsubscribe()).rejects.toThrow('unsubscribe failed');
      });

      expect(result.current.error?.message).toBe('unsubscribe failed');
      expect(result.current.subscribed).toBe(true);
    });

    it('未サポートブラウザでは何もせず subscribed=false', async () => {
      setupBrowser({ hasNotification: false });
      const { result } = renderHook(() => usePushSubscription());

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(result.current.subscribed).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('既存 subscription がなくてもエラーにならない', async () => {
      setupBrowser({ existingSubscription: null });
      const { result } = renderHook(() => usePushSubscription());

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(result.current.subscribed).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
