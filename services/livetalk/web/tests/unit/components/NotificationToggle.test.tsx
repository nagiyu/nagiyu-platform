import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotificationToggle, { NOTIFICATION_TOGGLE_MESSAGES } from '@/components/NotificationToggle';
import { subscribePush } from '@nagiyu/browser';

jest.mock('@nagiyu/browser', () => ({
  subscribePush: jest.fn(),
}));

const mockSubscribePush = subscribePush as jest.Mock;

/** プッシュ通知に対応したブラウザ環境を擬似的に整える。 */
function setupSupported(permission: NotificationPermission = 'default') {
  Object.defineProperty(window, 'Notification', {
    value: { permission, requestPermission: jest.fn().mockResolvedValue(permission) },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register: jest.fn(), getRegistration: jest.fn() },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'PushManager', {
    value: function PushManager() {},
    configurable: true,
    writable: true,
  });
}

/** プッシュ通知非対応の環境にする。 */
function setupUnsupported() {
  // @ts-expect-error テストのため削除
  delete window.Notification;
  // @ts-expect-error テストのため削除
  delete window.PushManager;
}

afterEach(() => {
  jest.clearAllMocks();
  setupUnsupported();
});

describe('NotificationToggle', () => {
  it('非対応ブラウザでは何も表示しない', () => {
    setupUnsupported();
    const { container } = render(<NotificationToggle />);
    expect(container).toBeEmptyDOMElement();
  });

  it('未許可のときは購読ボタンを表示する', () => {
    setupSupported('default');
    render(<NotificationToggle />);
    expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.PROMPT)).toBeInTheDocument();
  });

  it('許可済みのときは購読済みメッセージを表示する', () => {
    setupSupported('granted');
    render(<NotificationToggle />);
    expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.SUBSCRIBED)).toBeInTheDocument();
  });

  it('拒否済みのときは案内メッセージを表示する', () => {
    setupSupported('denied');
    render(<NotificationToggle />);
    expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.DENIED)).toBeInTheDocument();
  });

  it('ボタンクリックで subscribePush を呼び、成功すると購読済み表示になる', async () => {
    setupSupported('default');
    mockSubscribePush.mockResolvedValue({});
    render(<NotificationToggle />);

    fireEvent.click(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.PROMPT));

    await waitFor(() => {
      expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.SUBSCRIBED)).toBeInTheDocument();
    });
    expect(mockSubscribePush).toHaveBeenCalledTimes(1);
  });

  it('購読が拒否されると拒否メッセージを表示する', async () => {
    setupSupported('default');
    mockSubscribePush.mockImplementation(async () => {
      // ブラウザが許可を拒否した状態を再現
      (window.Notification as unknown as { permission: NotificationPermission }).permission =
        'denied';
      throw new Error('通知が拒否されました');
    });
    render(<NotificationToggle />);

    fireEvent.click(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.PROMPT));

    await waitFor(() => {
      expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.DENIED)).toBeInTheDocument();
    });
  });

  it('購読がその他の理由で失敗するとエラーメッセージを表示する', async () => {
    setupSupported('default');
    mockSubscribePush.mockRejectedValue(new Error('ネットワークエラー'));
    render(<NotificationToggle />);

    fireEvent.click(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.PROMPT));

    await waitFor(() => {
      expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.ERROR)).toBeInTheDocument();
    });
  });
});
