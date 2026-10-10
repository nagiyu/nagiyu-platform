import { render, waitFor } from '@testing-library/react';
import {
  ServiceWorkerRegistration,
  SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES,
} from '../../src/components/ServiceWorkerRegistration';

const registerServiceWorker = jest.fn();
const refreshPushSubscription = jest.fn();

// ブラウザ API に触れる手続きは libs/browser 側で検証済みのため、ここでは呼び出しの配線だけを確認する
jest.mock('@nagiyu/browser', () => ({
  registerServiceWorker: (...args: unknown[]) => registerServiceWorker(...args),
  refreshPushSubscription: (...args: unknown[]) => refreshPushSubscription(...args),
}));

const setServiceWorker = (enabled: boolean) => {
  if (enabled) {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  } else {
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  }
};

describe('ServiceWorkerRegistration', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    registerServiceWorker.mockReset().mockResolvedValue({});
    refreshPushSubscription.mockReset().mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setServiceWorker(true);
  });

  afterEach(() => {
    consoleError.mockRestore();
    setServiceWorker(false);
  });

  it('何も描画しない', () => {
    const { container } = render(<ServiceWorkerRegistration />);
    expect(container).toBeEmptyDOMElement();
  });

  it('マウント時に swPath で Service Worker を登録する', async () => {
    render(<ServiceWorkerRegistration swPath="/sw-push.js" />);
    await waitFor(() => expect(registerServiceWorker).toHaveBeenCalledWith('/sw-push.js'));
  });

  it('resubscribe が未指定なら再購読しない', async () => {
    render(<ServiceWorkerRegistration />);
    await waitFor(() => expect(registerServiceWorker).toHaveBeenCalled());
    expect(refreshPushSubscription).not.toHaveBeenCalled();
  });

  it('resubscribe が true なら共通オプションを渡して再購読する', async () => {
    render(
      <ServiceWorkerRegistration
        swPath="/sw-push.js"
        resubscribe
        vapidPublicKeyEndpoint="/api/notify/vapid-key"
        subscribeEndpoint="/api/notify/subscribe"
        bodyShape="raw"
      />
    );
    await waitFor(() =>
      expect(refreshPushSubscription).toHaveBeenCalledWith({
        swPath: '/sw-push.js',
        vapidPublicKeyEndpoint: '/api/notify/vapid-key',
        subscribeEndpoint: '/api/notify/subscribe',
        bodyShape: 'raw',
      })
    );
  });

  it('SW 登録に失敗したら console.error に出し、再購読しない', async () => {
    const failure = new Error('register failed');
    registerServiceWorker.mockRejectedValue(failure);
    render(<ServiceWorkerRegistration resubscribe />);
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.SERVICE_WORKER_REGISTRATION_FAILED,
        failure
      )
    );
    expect(refreshPushSubscription).not.toHaveBeenCalled();
  });

  it('再購読に失敗したら console.error に出す', async () => {
    const failure = new Error('refresh failed');
    refreshPushSubscription.mockRejectedValue(failure);
    render(<ServiceWorkerRegistration resubscribe />);
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.PUSH_SUBSCRIPTION_REFRESH_FAILED,
        failure
      )
    );
  });

  it('Service Worker 非対応のブラウザでは何もしない', async () => {
    setServiceWorker(false);
    render(<ServiceWorkerRegistration resubscribe />);
    await Promise.resolve();
    expect(registerServiceWorker).not.toHaveBeenCalled();
    expect(refreshPushSubscription).not.toHaveBeenCalled();
  });
});
