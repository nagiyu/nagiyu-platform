import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import {
  default as ServiceWorkerRegistration,
  SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES,
} from '../../../src/components/ServiceWorkerRegistration';
import { urlBase64ToUint8Array } from '@nagiyu/browser';

jest.mock(
  '@nagiyu/browser',
  () => ({
    urlBase64ToUint8Array: jest.fn(() => new Uint8Array([1, 2, 3])),
  }),
  { virtual: true }
);

describe('ServiceWorkerRegistration', () => {
  const mockUpdate = jest.fn();
  const mockGetSubscription = jest.fn();
  const mockSubscribe = jest.fn();
  const mockRegister = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn() as jest.Mock;

    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: {
        permission: 'granted',
      },
    });

    const registration = {
      update: mockUpdate,
      pushManager: {
        getSubscription: mockGetSubscription,
        subscribe: mockSubscribe,
      },
    };

    mockRegister.mockResolvedValue(registration);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: mockRegister,
        ready: Promise.resolve(registration),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });
  });

  it('subscribeEndpoint 未指定時は Service Worker 登録のみ行う', async () => {
    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('/sw.js');
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('subscribeEndpoint 指定時は既存サブスクリプションをサーバー送信する', async () => {
    const subscriptionJson = { endpoint: 'https://example.com' };
    const existingSubscription = {
      toJSON: jest.fn().mockReturnValue(subscriptionJson),
    };

    mockGetSubscription.mockResolvedValue(existingSubscription);
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true });

    render(<ServiceWorkerRegistration subscribeEndpoint="/api/push/subscribe" />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscription: subscriptionJson }),
      });
    });
  });

  it('サブスクリプション未作成時は VAPID 公開鍵取得と購読作成を行う', async () => {
    const createdSubscription = {
      toJSON: jest.fn().mockReturnValue({ endpoint: 'https://created.example.com' }),
    };

    mockGetSubscription.mockResolvedValue(null);
    mockSubscribe.mockResolvedValue(createdSubscription);
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ publicKey: 'test-public-key' }),
      })
      .mockResolvedValueOnce({ ok: true });

    render(<ServiceWorkerRegistration subscribeEndpoint="/api/push/refresh" />);

    await waitFor(() => {
      expect(urlBase64ToUint8Array).toHaveBeenCalledWith('test-public-key');
      expect(mockSubscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array([1, 2, 3]),
      });
      expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/push/refresh', expect.any(Object));
    });
  });

  it('VAPID 公開鍵取得失敗時はエラーを出力し、購読作成を行わない', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    mockGetSubscription.mockResolvedValue(null);
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

    render(<ServiceWorkerRegistration subscribeEndpoint="/api/push/subscribe" />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.VAPID_PUBLIC_KEY_FETCH_FAILED
      );
    });

    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('Push 通知購読作成失敗時はエラーを出力する', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const subscribeError = new Error('subscribe failed');

    mockGetSubscription.mockResolvedValue(null);
    mockSubscribe.mockRejectedValue(subscribeError);
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: 'test-public-key' }),
    });

    render(<ServiceWorkerRegistration subscribeEndpoint="/api/push/subscribe" />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.PUSH_SUBSCRIPTION_CREATE_FAILED,
        subscribeError
      );
    });
  });

  it('サブスクリプション送信が401以外で失敗した場合はエラーを出力する', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const existingSubscription = {
      toJSON: jest.fn().mockReturnValue({ endpoint: 'https://example.com' }),
    };

    mockGetSubscription.mockResolvedValue(existingSubscription);
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

    render(<ServiceWorkerRegistration subscribeEndpoint="/api/push/subscribe" />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.PUSH_SUBSCRIPTION_REGISTER_FAILED,
        500
      );
    });
  });

  it('Service Worker 登録失敗時はエラーを出力する', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRegister.mockRejectedValue(new Error('registration failed'));

    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.SERVICE_WORKER_REGISTRATION_FAILED,
        expect.any(Error)
      );
    });
  });
});
