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

  const created: MockPushSubscription =
    newSubscription ?? {
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

afterEach(() => {
  delete (window as unknown as { Notification?: unknown }).Notification;
  delete (window as unknown as { PushManager?: unknown }).PushManager;
});

describe('usePushSubscription', () => {
  const getVapidPublicKey = jest.fn().mockResolvedValue('SGVsbG8');

  beforeEach(() => {
    getVapidPublicKey.mockClear();
  });

  describe('初期状態', () => {
    it('未サポートブラウザでは supported=false', async () => {
      setupBrowser({ hasNotification: false });
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );
      expect(result.current.supported).toBe(false);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('サポート対応ブラウザでは supported=true', async () => {
      setupBrowser();
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );
      expect(result.current.supported).toBe(true);
    });

    it('既存 subscription があれば subscribed=true になる', async () => {
      const existing: MockPushSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      setupBrowser({ existingSubscription: existing });
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );
      await waitFor(() => expect(result.current.subscribed).toBe(true));
    });

    it('既存 subscription がなければ subscribed=false のまま', async () => {
      setupBrowser({ existingSubscription: null });
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );
      // 初期化処理が走った後も subscribed は false のまま
      await waitFor(() => {
        expect(result.current.subscribed).toBe(false);
      });
    });

    it('permission は Notification.permission を反映する', async () => {
      setupBrowser({ permission: 'denied' });
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );
      expect(result.current.permission).toBe('denied');
    });
  });

  describe('subscribe()', () => {
    it('成功時に subscribed=true, getVapidPublicKey が呼ばれる', async () => {
      setupBrowser({ permission: 'granted' });
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );

      await act(async () => {
        await result.current.subscribe();
      });

      expect(getVapidPublicKey).toHaveBeenCalledTimes(1);
      expect(result.current.subscribed).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it('onSubscribed コールバックが呼ばれる', async () => {
      const { created } = setupBrowser({ permission: 'granted' });
      const onSubscribed = jest.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey, onSubscribed })
      );

      await act(async () => {
        await result.current.subscribe();
      });

      expect(onSubscribed).toHaveBeenCalledWith(created);
    });

    it('失敗時に error が設定され throw される', async () => {
      setupBrowser({ permission: 'denied' });
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );

      await act(async () => {
        await expect(result.current.subscribe()).rejects.toThrow();
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.subscribed).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it('getVapidPublicKey が失敗した場合は error が設定される', async () => {
      setupBrowser({ permission: 'granted' });
      const failingGetKey = jest.fn().mockRejectedValue(new Error('fetch failed'));
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey: failingGetKey })
      );

      await act(async () => {
        await expect(result.current.subscribe()).rejects.toThrow('fetch failed');
      });

      expect(result.current.error?.message).toBe('fetch failed');
    });

    it('swPath が subscribePush に伝搬される', async () => {
      const { registerFn } = setupBrowser({
        permission: 'granted',
        existingRegistration: 'none',
      });
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey, swPath: '/custom-sw.js' })
      );

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
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );
      await waitFor(() => expect(result.current.subscribed).toBe(true));

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(existing.unsubscribe).toHaveBeenCalled();
      expect(result.current.subscribed).toBe(false);
    });

    it('onUnsubscribed コールバックが呼ばれる', async () => {
      const existing: MockPushSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      setupBrowser({ existingSubscription: existing });
      const onUnsubscribed = jest.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey, onUnsubscribed })
      );
      await waitFor(() => expect(result.current.subscribed).toBe(true));

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(onUnsubscribed).toHaveBeenCalledTimes(1);
    });

    it('未サポートブラウザでは何もせず subscribed=false', async () => {
      setupBrowser({ hasNotification: false });
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(result.current.subscribed).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('既存 subscription がなくてもエラーにならない', async () => {
      setupBrowser({ existingSubscription: null });
      const { result } = renderHook(() =>
        usePushSubscription({ getVapidPublicKey })
      );

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(result.current.subscribed).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
