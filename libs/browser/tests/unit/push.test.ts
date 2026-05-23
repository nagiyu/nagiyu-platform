/**
 * @jest-environment jsdom
 */
import {
  urlBase64ToUint8Array,
  subscribePush,
  PUSH_ERROR_MESSAGES,
} from '../../src/push';

describe('push utilities', () => {
  describe('urlBase64ToUint8Array', () => {
    it('Base64 URL 文字列を Uint8Array に変換できる', () => {
      const result = urlBase64ToUint8Array('SGVsbG8');
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
    });

    it('URL セーフ文字を含む場合でも変換できる', () => {
      const result = urlBase64ToUint8Array('-w');
      expect(Array.from(result)).toEqual([251]);
    });
  });

  describe('subscribePush', () => {
    // 有効な base64url 文字列（実際の VAPID キー長ではないが urlBase64ToUint8Array が成功する）
    const VAPID_KEY = 'SGVsbG8';

    type MockPushSubscription = {
      toJSON: () => Record<string, unknown>;
    };

    type SetupOptions = {
      hasNotification?: boolean;
      hasServiceWorker?: boolean;
      hasPushManager?: boolean;
      permission?: NotificationPermission;
      existingRegistration?: unknown;
      existingSubscription?: MockPushSubscription | null;
      registerImpl?: jest.Mock;
      subscribeImpl?: jest.Mock;
    };

    const setupBrowser = (options: SetupOptions = {}) => {
      const {
        hasNotification = true,
        hasServiceWorker = true,
        hasPushManager = true,
        permission = 'granted',
        existingRegistration,
        existingSubscription = null,
        registerImpl,
        subscribeImpl,
      } = options;

      const createdSubscription: MockPushSubscription = {
        toJSON: () => ({ endpoint: 'https://example.com/sub' }),
      };

      const subscribeFn =
        subscribeImpl ?? jest.fn().mockResolvedValue(createdSubscription);
      const getSubscriptionFn = jest.fn().mockResolvedValue(existingSubscription);
      const registration = {
        pushManager: {
          getSubscription: getSubscriptionFn,
          subscribe: subscribeFn,
        },
      };

      // existingRegistration === null は「既存なし」、undefined は「既定で registration を返す」
      const resolvedRegistration =
        existingRegistration === undefined ? registration : existingRegistration;
      const getRegistrationFn = jest.fn().mockResolvedValue(resolvedRegistration);
      const registerFn = registerImpl ?? jest.fn().mockResolvedValue(registration);

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
        // jsdom では navigator.serviceWorker は元々ない
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
        registration,
        createdSubscription,
      };
    };

    afterEach(() => {
      // クリーンアップ
      delete (window as unknown as { Notification?: unknown }).Notification;
      delete (window as unknown as { PushManager?: unknown }).PushManager;
    });

    it('Notification API がない場合は UNSUPPORTED エラー', async () => {
      setupBrowser({ hasNotification: false });
      await expect(subscribePush({ vapidPublicKey: VAPID_KEY })).rejects.toThrow(
        PUSH_ERROR_MESSAGES.UNSUPPORTED
      );
    });

    it('Service Worker API がない場合は UNSUPPORTED エラー', async () => {
      setupBrowser({ hasServiceWorker: false });
      await expect(subscribePush({ vapidPublicKey: VAPID_KEY })).rejects.toThrow(
        PUSH_ERROR_MESSAGES.UNSUPPORTED
      );
    });

    it('PushManager がない場合は UNSUPPORTED エラー', async () => {
      setupBrowser({ hasPushManager: false });
      await expect(subscribePush({ vapidPublicKey: VAPID_KEY })).rejects.toThrow(
        PUSH_ERROR_MESSAGES.UNSUPPORTED
      );
    });

    it('通知許可が拒否された場合は PERMISSION_DENIED エラー', async () => {
      setupBrowser({ permission: 'denied' });
      await expect(subscribePush({ vapidPublicKey: VAPID_KEY })).rejects.toThrow(
        PUSH_ERROR_MESSAGES.PERMISSION_DENIED
      );
    });

    it('既存の SW 登録があれば再利用する', async () => {
      const { registerFn, getRegistrationFn } = setupBrowser();
      await subscribePush({ vapidPublicKey: VAPID_KEY });
      expect(getRegistrationFn).toHaveBeenCalledTimes(1);
      expect(registerFn).not.toHaveBeenCalled();
    });

    it('既存の SW 登録がなければ新規登録する', async () => {
      const { registerFn } = setupBrowser({ existingRegistration: null });
      await subscribePush({ vapidPublicKey: VAPID_KEY, swPath: '/custom-sw.js' });
      expect(registerFn).toHaveBeenCalledWith('/custom-sw.js');
    });

    it('既定の swPath は /sw.js', async () => {
      const { registerFn } = setupBrowser({ existingRegistration: null });
      await subscribePush({ vapidPublicKey: VAPID_KEY });
      expect(registerFn).toHaveBeenCalledWith('/sw.js');
    });

    it('既存の subscription があれば再利用する', async () => {
      const existing: MockPushSubscription = { toJSON: () => ({ endpoint: 'existing' }) };
      const { subscribeFn } = setupBrowser({ existingSubscription: existing });
      const result = await subscribePush({ vapidPublicKey: VAPID_KEY });
      expect(subscribeFn).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('既存の subscription がなければ pushManager.subscribe を呼ぶ', async () => {
      const { subscribeFn, createdSubscription } = setupBrowser();
      const result = await subscribePush({ vapidPublicKey: VAPID_KEY });
      expect(subscribeFn).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      });
      expect(result).toBe(createdSubscription);
    });

    it('onSubscribed コールバックが呼ばれる', async () => {
      const { createdSubscription } = setupBrowser();
      const onSubscribed = jest.fn().mockResolvedValue(undefined);
      await subscribePush({ vapidPublicKey: VAPID_KEY, onSubscribed });
      expect(onSubscribed).toHaveBeenCalledWith(createdSubscription);
    });

    it('onSubscribed が同期関数でも動作する', async () => {
      setupBrowser();
      const onSubscribed = jest.fn();
      await expect(
        subscribePush({ vapidPublicKey: VAPID_KEY, onSubscribed })
      ).resolves.toBeDefined();
      expect(onSubscribed).toHaveBeenCalled();
    });

    it('onSubscribed が例外を投げた場合は伝播する', async () => {
      setupBrowser();
      const onSubscribed = jest.fn().mockRejectedValue(new Error('post failed'));
      await expect(
        subscribePush({ vapidPublicKey: VAPID_KEY, onSubscribed })
      ).rejects.toThrow('post failed');
    });

    it('vapidPublicKey に関数を渡せる（許可後に呼ばれる）', async () => {
      setupBrowser();
      const getKey = jest.fn().mockResolvedValue(VAPID_KEY);
      await subscribePush({ vapidPublicKey: getKey });
      expect(getKey).toHaveBeenCalledTimes(1);
    });

    it('vapidPublicKey の関数は許可拒否時には呼ばれない', async () => {
      setupBrowser({ permission: 'denied' });
      const getKey = jest.fn().mockResolvedValue(VAPID_KEY);
      await expect(
        subscribePush({ vapidPublicKey: getKey })
      ).rejects.toThrow(PUSH_ERROR_MESSAGES.PERMISSION_DENIED);
      expect(getKey).not.toHaveBeenCalled();
    });

    it('既存 subscription があれば vapidPublicKey の関数は呼ばれない', async () => {
      const existing: MockPushSubscription = { toJSON: () => ({ endpoint: 'existing' }) };
      setupBrowser({ existingSubscription: existing });
      const getKey = jest.fn().mockResolvedValue(VAPID_KEY);
      await subscribePush({ vapidPublicKey: getKey });
      expect(getKey).not.toHaveBeenCalled();
    });
  });
});
