import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotifyButton from '@/components/notify/NotifyButton';

jest.mock('@nagiyu/browser', () => ({
  urlBase64ToUint8Array: jest.fn(() => new Uint8Array([1, 2, 3])),
}));

describe('NotifyButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('通知許可後にサブスクリプションを登録できる', async () => {
    const toJSON = jest.fn(() => ({
      endpoint: 'https://example.com/push',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    }));
    const subscription = { toJSON };
    const subscribe = jest.fn().mockResolvedValue(subscription);
    const getSubscription = jest.fn().mockResolvedValue(null);
    const registration = {
      pushManager: {
        getSubscription,
        subscribe,
      },
    };
    const register = jest.fn().mockResolvedValue(registration);
    const getRegistration = jest.fn().mockResolvedValue(null);

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { requestPermission: jest.fn().mockResolvedValue('granted') },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, getRegistration },
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ publicKey: 'public-key' }),
      })
      .mockResolvedValueOnce({
        ok: true,
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<NotifyButton />);
    await userEvent.click(screen.getByRole('button', { name: '通知を有効にする' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/notify/vapid-key');
      expect(fetchMock).toHaveBeenCalledWith('/api/notify/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'https://example.com/push',
          keys: { p256dh: 'p256dh', auth: 'auth' },
        }),
      });
      expect(getRegistration).toHaveBeenCalledTimes(1);
      expect(subscribe).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('通知を有効化しました')).toBeInTheDocument();
  });

  it('通知拒否時はエラーメッセージを表示する', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { requestPermission: jest.fn().mockResolvedValue('denied') },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: jest.fn(), getRegistration: jest.fn() },
    });

    render(<NotifyButton />);
    await userEvent.click(screen.getByRole('button', { name: '通知を有効にする' }));

    expect(
      await screen.findByText('通知が拒否されました。ブラウザ設定から通知を許可してください')
    ).toBeInTheDocument();
  });

  it('通知非対応ブラウザではエラーメッセージを表示する', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });

    render(<NotifyButton />);
    await userEvent.click(screen.getByRole('button', { name: '通知を有効にする' }));

    expect(
      await screen.findByText('このブラウザはプッシュ通知に対応していません')
    ).toBeInTheDocument();
  });

  it('VAPID 公開鍵取得失敗時はエラーメッセージを表示する', async () => {
    const register = jest.fn().mockResolvedValue({
      pushManager: {
        getSubscription: jest.fn().mockResolvedValue(null),
        subscribe: jest.fn(),
      },
    });

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { requestPermission: jest.fn().mockResolvedValue('granted') },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, getRegistration: jest.fn().mockResolvedValue(null) },
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<NotifyButton />);
    await userEvent.click(screen.getByRole('button', { name: '通知を有効にする' }));

    expect(await screen.findByText('VAPID 公開鍵の取得に失敗しました')).toBeInTheDocument();
  });

  it('VAPID 公開鍵が空の場合はエラーメッセージを表示する', async () => {
    const register = jest.fn().mockResolvedValue({
      pushManager: {
        getSubscription: jest.fn().mockResolvedValue(null),
        subscribe: jest.fn(),
      },
    });

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { requestPermission: jest.fn().mockResolvedValue('granted') },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, getRegistration: jest.fn().mockResolvedValue(null) },
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: '' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<NotifyButton />);
    await userEvent.click(screen.getByRole('button', { name: '通知を有効にする' }));

    expect(await screen.findByText('VAPID 公開鍵が空です')).toBeInTheDocument();
  });

  it('購読登録 API 失敗時はエラーメッセージを表示する', async () => {
    const toJSON = jest.fn(() => ({
      endpoint: 'https://example.com/push',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    }));
    const register = jest.fn().mockResolvedValue({
      pushManager: {
        getSubscription: jest.fn().mockResolvedValue({ toJSON }),
        subscribe: jest.fn(),
      },
    });

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { requestPermission: jest.fn().mockResolvedValue('granted') },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, getRegistration: jest.fn().mockResolvedValue(null) },
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<NotifyButton />);
    await userEvent.click(screen.getByRole('button', { name: '通知を有効にする' }));

    expect(await screen.findByText('通知購読の登録に失敗しました')).toBeInTheDocument();
  });
});
