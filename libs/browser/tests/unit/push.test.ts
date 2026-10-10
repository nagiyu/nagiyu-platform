/**
 * @jest-environment jsdom
 */
import {
  urlBase64ToUint8Array,
  subscribePush,
  fetchVapidPublicKey,
  isPushSupported,
  postPushSubscription,
  registerServiceWorker,
  getPushSubscription,
  unsubscribePush,
  refreshPushSubscription,
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

      const subscribeFn = subscribeImpl ?? jest.fn().mockResolvedValue(createdSubscription);
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

    const originalFetch = global.fetch;

    beforeEach(() => {
      // onSubscribed 省略時の既定の送信先を実ネットワークに向けないためのスタブ
      global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
    });

    afterEach(() => {
      // クリーンアップ
      global.fetch = originalFetch;
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
      await expect(subscribePush({ vapidPublicKey: VAPID_KEY, onSubscribed })).rejects.toThrow(
        'post failed'
      );
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
      await expect(subscribePush({ vapidPublicKey: getKey })).rejects.toThrow(
        PUSH_ERROR_MESSAGES.PERMISSION_DENIED
      );
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

  describe('fetchVapidPublicKey', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('正常系: 既定エンドポイントで公開鍵を取得できる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ publicKey: 'test-vapid-key' }),
      } as Response);

      const key = await fetchVapidPublicKey();
      expect(key).toBe('test-vapid-key');
      expect(global.fetch).toHaveBeenCalledWith('/api/push/vapid-public-key');
    });

    it('カスタムエンドポイントを指定できる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ publicKey: 'custom-key' }),
      } as Response);

      const key = await fetchVapidPublicKey('/api/notify/vapid-key');
      expect(key).toBe('custom-key');
      expect(global.fetch).toHaveBeenCalledWith('/api/notify/vapid-key');
    });

    it('レスポンスが !ok の場合は VAPID_KEY_FETCH_FAILED エラーを投げる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      } as Response);

      await expect(fetchVapidPublicKey()).rejects.toThrow(
        PUSH_ERROR_MESSAGES.VAPID_KEY_FETCH_FAILED
      );
    });

    it('publicKey が空の場合は VAPID_KEY_EMPTY エラーを投げる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ publicKey: '' }),
      } as Response);

      await expect(fetchVapidPublicKey()).rejects.toThrow(PUSH_ERROR_MESSAGES.VAPID_KEY_EMPTY);
    });

    it('publicKey が undefined の場合は VAPID_KEY_EMPTY エラーを投げる', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      await expect(fetchVapidPublicKey()).rejects.toThrow(PUSH_ERROR_MESSAGES.VAPID_KEY_EMPTY);
    });
  });

  describe('isPushSupported', () => {
    const setup = (opts: {
      requestPermission?: unknown;
      notification?: boolean;
      register?: unknown;
      serviceWorker?: boolean;
      pushManager?: boolean;
    }) => {
      const { notification = true, serviceWorker = true, pushManager = true } = opts;
      // undefined を明示的に渡して「関数でない」状態を作れるよう、キーの有無で既定値を決める
      const requestPermission = 'requestPermission' in opts ? opts.requestPermission : jest.fn();
      const register = 'register' in opts ? opts.register : jest.fn();
      if (notification) {
        (window as unknown as { Notification: unknown }).Notification = { requestPermission };
      } else {
        delete (window as unknown as { Notification?: unknown }).Notification;
      }
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: serviceWorker ? { register } : undefined,
      });
      if (!serviceWorker) {
        // 'serviceWorker' in navigator を false にするため実体を削除する
        delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
      }
      if (pushManager) {
        (window as unknown as { PushManager: unknown }).PushManager = function () {};
      } else {
        delete (window as unknown as { PushManager?: unknown }).PushManager;
      }
    };

    afterEach(() => {
      delete (window as unknown as { Notification?: unknown }).Notification;
      delete (window as unknown as { PushManager?: unknown }).PushManager;
    });

    it('すべての API が揃っていれば true', () => {
      setup({});
      expect(isPushSupported()).toBe(true);
    });

    it('Notification がなければ false', () => {
      setup({ notification: false });
      expect(isPushSupported()).toBe(false);
    });

    it('requestPermission が関数でなければ false', () => {
      setup({ requestPermission: undefined });
      expect(isPushSupported()).toBe(false);
    });

    it('serviceWorker がなければ false', () => {
      setup({ serviceWorker: false });
      expect(isPushSupported()).toBe(false);
    });

    it('serviceWorker.register が関数でなければ false', () => {
      setup({ register: undefined });
      expect(isPushSupported()).toBe(false);
    });

    it('PushManager がなければ false', () => {
      setup({ pushManager: false });
      expect(isPushSupported()).toBe(false);
    });
  });

  describe('postPushSubscription', () => {
    const originalFetch = global.fetch;
    const json = { endpoint: 'https://example.com/sub', keys: { p256dh: 'a', auth: 'b' } };
    const subscription = { toJSON: () => json } as unknown as PushSubscription;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('既定では /api/push/subscribe に { subscription } で包んで POST する', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);

      await postPushSubscription(subscription);

      expect(global.fetch).toHaveBeenCalledWith('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: json }),
      });
    });

    it('endpoint と raw 形式を指定できる', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);

      await postPushSubscription(subscription, {
        endpoint: '/api/notify/subscribe',
        bodyShape: 'raw',
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/notify/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
    });

    it('レスポンスが !ok の場合は SUBSCRIPTION_REGISTER_FAILED エラーを投げる', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false } as Response);

      await expect(postPushSubscription(subscription)).rejects.toThrow(
        PUSH_ERROR_MESSAGES.SUBSCRIPTION_REGISTER_FAILED
      );
    });
  });

  describe('Service Worker 周りの手続き', () => {
    const VAPID_KEY = 'SGVsbG8';
    const originalFetch = global.fetch;

    type Sub = { toJSON: () => Record<string, unknown>; unsubscribe: jest.Mock };
    const makeSub = (): Sub => ({
      toJSON: () => ({ endpoint: 'https://example.com/sub' }),
      unsubscribe: jest.fn().mockResolvedValue(true),
    });

    type SetupOptions = {
      permission?: NotificationPermission;
      hasRegistration?: boolean;
      existingSubscription?: Sub | null;
      updateImpl?: jest.Mock;
      hasServiceWorker?: boolean;
    };

    const setup = (options: SetupOptions = {}) => {
      const {
        permission = 'granted',
        hasRegistration = true,
        existingSubscription = null,
        updateImpl,
        hasServiceWorker = true,
      } = options;

      const created = makeSub();
      const subscribeFn = jest.fn().mockResolvedValue(created);
      const getSubscriptionFn = jest.fn().mockResolvedValue(existingSubscription);
      const update = updateImpl ?? jest.fn().mockResolvedValue(undefined);
      const registration = {
        pushManager: { getSubscription: getSubscriptionFn, subscribe: subscribeFn },
        update,
      };
      const getRegistration = jest.fn().mockResolvedValue(hasRegistration ? registration : null);
      const register = jest.fn().mockResolvedValue(registration);
      const ready = Promise.resolve(registration);

      (window as unknown as { Notification: unknown }).Notification = {
        requestPermission: jest.fn().mockResolvedValue(permission),
        permission,
      };
      (window as unknown as { PushManager: unknown }).PushManager = function () {};
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: hasServiceWorker ? { register, getRegistration, ready } : undefined,
      });

      return { created, subscribeFn, getSubscriptionFn, update, getRegistration, register };
    };

    afterEach(() => {
      global.fetch = originalFetch;
      delete (window as unknown as { Notification?: unknown }).Notification;
      delete (window as unknown as { PushManager?: unknown }).PushManager;
    });

    describe('subscribePush の既定動作', () => {
      it('引数なしで公開鍵を既定エンドポイントから取得し、既定の送信先へ POST する', async () => {
        const { created } = setup();
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) })
          .mockResolvedValueOnce({ ok: true });

        const result = await subscribePush();

        expect(result).toBe(created);
        expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/push/vapid-public-key');
        expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: created.toJSON() }),
        });
      });

      it('エンドポイントと bodyShape を指定できる', async () => {
        const { created } = setup();
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) })
          .mockResolvedValueOnce({ ok: true });

        await subscribePush({
          vapidPublicKeyEndpoint: '/api/notify/vapid-key',
          subscribeEndpoint: '/api/notify/subscribe',
          bodyShape: 'raw',
        });

        expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/notify/vapid-key');
        expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/notify/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(created.toJSON()),
        });
      });

      it('onSubscribed を渡した場合は既定の送信を行わない', async () => {
        setup();
        global.fetch = jest.fn();
        const onSubscribed = jest.fn();

        await subscribePush({ vapidPublicKey: VAPID_KEY, onSubscribed });

        expect(onSubscribed).toHaveBeenCalledTimes(1);
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('既定の送信が失敗した場合は SUBSCRIPTION_REGISTER_FAILED を投げる', async () => {
        setup();
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

        await expect(subscribePush({ vapidPublicKey: VAPID_KEY })).rejects.toThrow(
          PUSH_ERROR_MESSAGES.SUBSCRIPTION_REGISTER_FAILED
        );
      });
    });

    describe('registerServiceWorker', () => {
      it('既定の swPath で登録し、更新確認して registration を返す', async () => {
        const { register, update } = setup();

        const registration = await registerServiceWorker();

        expect(register).toHaveBeenCalledWith('/sw.js');
        expect(update).toHaveBeenCalledTimes(1);
        expect(registration.update).toBe(update);
      });

      it('swPath を指定できる', async () => {
        const { register } = setup();
        await registerServiceWorker('/sw-push.js');
        expect(register).toHaveBeenCalledWith('/sw-push.js');
      });

      it('update() が非同期に失敗しても登録は成功する', async () => {
        setup({ updateImpl: jest.fn().mockRejectedValue(new Error('offline')) });
        await expect(registerServiceWorker()).resolves.toBeDefined();
      });

      it('update() が同期的に例外を投げても登録は成功する', async () => {
        setup({
          updateImpl: jest.fn(() => {
            throw new Error('sync failure');
          }),
        });
        await expect(registerServiceWorker()).resolves.toBeDefined();
      });

      it('Service Worker 非対応なら SERVICE_WORKER_UNSUPPORTED を投げる', async () => {
        setup({ hasServiceWorker: false });
        await expect(registerServiceWorker()).rejects.toThrow(
          PUSH_ERROR_MESSAGES.SERVICE_WORKER_UNSUPPORTED
        );
      });
    });

    describe('getPushSubscription', () => {
      it('Service Worker 非対応なら null', async () => {
        setup({ hasServiceWorker: false });
        await expect(getPushSubscription()).resolves.toBeNull();
      });

      it('PushManager 非対応なら SW の登録を見ずに null', async () => {
        const { getRegistration } = setup({ existingSubscription: makeSub() });
        delete (window as unknown as { PushManager?: unknown }).PushManager;
        await expect(getPushSubscription()).resolves.toBeNull();
        expect(getRegistration).not.toHaveBeenCalled();
      });

      it('SW 未登録なら null', async () => {
        const { getSubscriptionFn } = setup({ hasRegistration: false });
        await expect(getPushSubscription()).resolves.toBeNull();
        expect(getSubscriptionFn).not.toHaveBeenCalled();
      });

      it('登録済みなら pushManager.getSubscription の結果を返す', async () => {
        const existing = makeSub();
        setup({ existingSubscription: existing });
        await expect(getPushSubscription()).resolves.toBe(existing);
      });

      it('購読がなければ null', async () => {
        setup({ existingSubscription: null });
        await expect(getPushSubscription()).resolves.toBeNull();
      });
    });

    describe('unsubscribePush', () => {
      it('既存の購読があれば unsubscribe する', async () => {
        const existing = makeSub();
        setup({ existingSubscription: existing });
        await unsubscribePush();
        expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
      });

      it('未購読なら何もしない', async () => {
        setup({ existingSubscription: null });
        await expect(unsubscribePush()).resolves.toBeUndefined();
      });

      it('非対応なら何もしない', async () => {
        setup({ hasServiceWorker: false });
        await expect(unsubscribePush()).resolves.toBeUndefined();
      });
    });

    describe('refreshPushSubscription', () => {
      it('非対応ブラウザでは何もしない', async () => {
        setup({ hasServiceWorker: false });
        global.fetch = jest.fn();
        await refreshPushSubscription();
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it.each(['default', 'denied'] as const)(
        '許可が %s のときは許可を求めず何もしない',
        async (permission) => {
          const { getRegistration } = setup({ permission });
          global.fetch = jest.fn();
          await refreshPushSubscription();
          expect(getRegistration).not.toHaveBeenCalled();
          expect(global.fetch).not.toHaveBeenCalled();
          expect(window.Notification.requestPermission).not.toHaveBeenCalled();
        }
      );

      it('既存の購読があればそれを既定の送信先へ送る (公開鍵は取得しない)', async () => {
        const existing = makeSub();
        const { subscribeFn, register } = setup({ existingSubscription: existing });
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

        await refreshPushSubscription();

        expect(subscribeFn).not.toHaveBeenCalled();
        expect(register).not.toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: existing.toJSON() }),
        });
      });

      it('購読がなければ公開鍵を取得して新規購読し、送信する', async () => {
        const { created, subscribeFn } = setup({ existingSubscription: null });
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) })
          .mockResolvedValueOnce({ ok: true, status: 200 });

        await refreshPushSubscription({
          vapidPublicKeyEndpoint: '/api/notify/vapid-key',
          subscribeEndpoint: '/api/notify/subscribe',
          bodyShape: 'raw',
        });

        expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/notify/vapid-key');
        expect(subscribeFn).toHaveBeenCalledWith({
          userVisibleOnly: true,
          applicationServerKey: expect.any(Uint8Array),
        });
        expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/notify/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(created.toJSON()),
        });
      });

      it('SW 未登録なら swPath で登録する', async () => {
        const { register } = setup({ hasRegistration: false, existingSubscription: makeSub() });
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

        await refreshPushSubscription({ swPath: '/sw-push.js' });

        expect(register).toHaveBeenCalledWith('/sw-push.js');
      });

      it('SW 未登録で swPath 省略なら /sw.js で登録する', async () => {
        const { register } = setup({ hasRegistration: false, existingSubscription: makeSub() });
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

        await refreshPushSubscription();

        expect(register).toHaveBeenCalledWith('/sw.js');
      });

      it('送信が 401 のときは未ログインとして静かに終える', async () => {
        setup({ existingSubscription: makeSub() });
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

        await expect(refreshPushSubscription()).resolves.toBeUndefined();
      });

      it('送信が 401 以外で失敗したら SUBSCRIPTION_REGISTER_FAILED を投げる', async () => {
        setup({ existingSubscription: makeSub() });
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

        await expect(refreshPushSubscription()).rejects.toThrow(
          PUSH_ERROR_MESSAGES.SUBSCRIPTION_REGISTER_FAILED
        );
      });

      it('公開鍵の取得に失敗したら例外を投げる', async () => {
        setup({ existingSubscription: null });
        global.fetch = jest.fn().mockResolvedValue({ ok: false });

        await expect(refreshPushSubscription()).rejects.toThrow(
          PUSH_ERROR_MESSAGES.VAPID_KEY_FETCH_FAILED
        );
      });
    });
  });
});
