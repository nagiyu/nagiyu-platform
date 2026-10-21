import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationPermission from '@/components/NotificationPermission';
import { snoozeNotificationPermission } from '@/lib/pwa/standalone';

const mockSubscribe = jest.fn();
const mockUsePushSubscription = jest.fn();

jest.mock('@nagiyu/react', () => ({
  usePushSubscription: (...args: unknown[]) => mockUsePushSubscription(...args),
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

const mockSnoozeNotificationPermission = snoozeNotificationPermission as jest.Mock;

type HookState = {
  permission: NotificationPermission;
  loading: boolean;
  error: Error | null;
};

/** hook の戻り値を差し替える。指定のないものは「未操作」の状態とする。 */
function setupHook(state: Partial<HookState> = {}) {
  mockUsePushSubscription.mockReturnValue({
    permission: 'default',
    loading: false,
    error: null,
    subscribe: mockSubscribe,
    ...state,
  });
}

beforeEach(() => {
  setupHook();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('NotificationPermission', () => {
  it('通知許可ボタンとスキップボタンが表示される', () => {
    render(<NotificationPermission onGranted={jest.fn()} onSkip={jest.fn()} />);
    expect(screen.getByText('通知を許可する')).toBeInTheDocument();
    expect(screen.getByText('あとでね')).toBeInTheDocument();
  });

  it('購読成功で onGranted が呼ばれる', async () => {
    mockSubscribe.mockResolvedValue({});
    const onGranted = jest.fn();
    render(<NotificationPermission onGranted={onGranted} onSkip={jest.fn()} />);

    fireEvent.click(screen.getByText('通知を許可する'));

    await waitFor(() => {
      expect(onGranted).toHaveBeenCalledTimes(1);
    });
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });

  it('購読に失敗すると onGranted は呼ばれない', async () => {
    mockSubscribe.mockRejectedValue(new Error('network error'));
    const onGranted = jest.fn();
    render(<NotificationPermission onGranted={onGranted} onSkip={jest.fn()} />);

    fireEvent.click(screen.getByText('通知を許可する'));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('購読処理中はボタンが読み込み中になる', () => {
    setupHook({ loading: true });
    render(<NotificationPermission onGranted={jest.fn()} onSkip={jest.fn()} />);

    expect(screen.getByRole('button', { name: /通知を許可する/ })).toBeDisabled();
  });

  it('失敗時に permission が denied なら拒否メッセージが表示される', () => {
    setupHook({ permission: 'denied', error: new Error('denied') });
    render(<NotificationPermission onGranted={jest.fn()} onSkip={jest.fn()} />);

    expect(screen.getByText('ブラウザの設定から通知を許可してね')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('操作前に permission が denied でも拒否メッセージは表示されない', () => {
    setupHook({ permission: 'denied' });
    render(<NotificationPermission onGranted={jest.fn()} onSkip={jest.fn()} />);

    expect(screen.queryByText('ブラウザの設定から通知を許可してね')).not.toBeInTheDocument();
  });

  it('失敗時に permission が denied 以外ならエラーメッセージが表示される', () => {
    setupHook({ permission: 'default', error: new Error('network error') });
    render(<NotificationPermission onGranted={jest.fn()} onSkip={jest.fn()} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText('通知の設定に失敗しちゃった。あとでもう一度試してね')
    ).toBeInTheDocument();
    expect(screen.queryByText('ブラウザの設定から通知を許可してね')).not.toBeInTheDocument();
  });

  it('「あとでね」クリックで snoozeNotificationPermission と onSkip が呼ばれる', () => {
    const onSkip = jest.fn();
    render(<NotificationPermission onGranted={jest.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByText('あとでね'));

    expect(mockSnoozeNotificationPermission).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
