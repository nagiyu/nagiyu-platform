import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationPermission from '@/components/NotificationPermission';
import { subscribePush } from '@nagiyu/browser';
import { snoozeNotificationPermission } from '@/lib/pwa/standalone';

jest.mock('@nagiyu/browser', () => ({
  subscribePush: jest.fn(),
}));

jest.mock('@/lib/pwa/standalone', () => ({
  snoozeNotificationPermission: jest.fn(),
  snoozeInstallGuide: jest.fn(),
}));

jest.mock('@/lib/pwa/messages', () => ({
  PWA_MESSAGES: {
    NOTIFICATION_BUTTON: '通知を許可する',
    SKIP: 'あとでね',
    NOTIFICATION_DENIED_HINT: 'ブラウザの設定から通知を許可してね',
    NOTIFICATION_ERROR: '通知の設定に失敗しちゃった。あとでもう一度試してね',
  },
}));

const mockSubscribePush = subscribePush as jest.Mock;
const mockSnoozeNotificationPermission = snoozeNotificationPermission as jest.Mock;

/** fetch をモックして vapid-public-key と subscribe に応答する */
function setupFetch() {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url === '/api/push/vapid-public-key') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-key' }),
      });
    }
    if (url === '/api/push/subscribe') {
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({ ok: false });
  });
}

afterEach(() => {
  jest.clearAllMocks();
  // 通知許可状態をリセットしてテスト間干渉を防ぐ
  Object.defineProperty(window, 'Notification', {
    value: { permission: 'default' },
    configurable: true,
    writable: true,
  });
});

describe('NotificationPermission', () => {
  it('通知許可ボタンとスキップボタンが表示される', () => {
    render(<NotificationPermission onGranted={jest.fn()} onSkip={jest.fn()} />);
    expect(screen.getByText('通知を許可する')).toBeInTheDocument();
    expect(screen.getByText('あとでね')).toBeInTheDocument();
  });

  it('購読成功で onGranted が呼ばれる', async () => {
    setupFetch();
    mockSubscribePush.mockResolvedValue({});
    const onGranted = jest.fn();
    render(<NotificationPermission onGranted={onGranted} onSkip={jest.fn()} />);

    fireEvent.click(screen.getByText('通知を許可する'));

    await waitFor(() => {
      expect(onGranted).toHaveBeenCalledTimes(1);
    });
    expect(mockSubscribePush).toHaveBeenCalledTimes(1);
  });

  it('通知が拒否されると拒否メッセージが表示される', async () => {
    setupFetch();
    mockSubscribePush.mockImplementation(async () => {
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'denied' },
        configurable: true,
      });
      throw new Error('denied');
    });
    render(<NotificationPermission onGranted={jest.fn()} onSkip={jest.fn()} />);

    fireEvent.click(screen.getByText('通知を許可する'));

    await waitFor(() => {
      expect(screen.getByText('ブラウザの設定から通知を許可してね')).toBeInTheDocument();
    });
  });

  it('購読がその他の理由で失敗するとエラーメッセージが表示される', async () => {
    setupFetch();
    mockSubscribePush.mockRejectedValue(new Error('network error'));
    render(<NotificationPermission onGranted={jest.fn()} onSkip={jest.fn()} />);

    fireEvent.click(screen.getByText('通知を許可する'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(
        screen.getByText('通知の設定に失敗しちゃった。あとでもう一度試してね')
      ).toBeInTheDocument();
    });
  });

  it('「あとでね」クリックで snoozeNotificationPermission と onSkip が呼ばれる', () => {
    const onSkip = jest.fn();
    render(<NotificationPermission onGranted={jest.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByText('あとでね'));

    expect(mockSnoozeNotificationPermission).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
