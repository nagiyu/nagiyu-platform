import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotificationToggle, { NOTIFICATION_TOGGLE_MESSAGES } from '@/components/NotificationToggle';

const mockSubscribe = jest.fn();
const mockUsePushSubscription = jest.fn();

jest.mock('@nagiyu/react', () => ({
  usePushSubscription: (...args: unknown[]) => mockUsePushSubscription(...args),
}));

type HookState = {
  supported: boolean;
  ready: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  loading: boolean;
  error: Error | null;
};

/** hook の戻り値を差し替える。指定のないものは「対応済み・確定済み・未購読」とする。 */
function setupHook(state: Partial<HookState> = {}) {
  mockUsePushSubscription.mockReturnValue({
    supported: true,
    ready: true,
    permission: 'default',
    subscribed: false,
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

describe('NotificationToggle', () => {
  it('対応状況が確定するまでは何も表示しない', () => {
    setupHook({ ready: false, supported: false });
    const { container } = render(<NotificationToggle />);
    expect(container).toBeEmptyDOMElement();
  });

  it('非対応ブラウザでは何も表示しない', () => {
    setupHook({ supported: false });
    const { container } = render(<NotificationToggle />);
    expect(container).toBeEmptyDOMElement();
  });

  it('未購読のときは購読ボタンを表示する', () => {
    render(<NotificationToggle />);
    expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.PROMPT)).toBeInTheDocument();
  });

  it('購読しているときは購読済みメッセージを表示する', () => {
    setupHook({ permission: 'granted', subscribed: true });
    render(<NotificationToggle />);
    expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.SUBSCRIBED)).toBeInTheDocument();
  });

  it('許可済みでも購読していないときは購読ボタンを表示する', () => {
    setupHook({ permission: 'granted', subscribed: false });
    render(<NotificationToggle />);
    expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.PROMPT)).toBeInTheDocument();
    expect(screen.queryByText(NOTIFICATION_TOGGLE_MESSAGES.SUBSCRIBED)).not.toBeInTheDocument();
  });

  it('拒否済みのときは案内メッセージを表示する', () => {
    setupHook({ permission: 'denied' });
    render(<NotificationToggle />);
    expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.DENIED)).toBeInTheDocument();
  });

  it('購読処理中はボタンを無効にして処理中の表示にする', () => {
    setupHook({ loading: true });
    render(<NotificationToggle />);
    expect(
      screen.getByRole('button', { name: NOTIFICATION_TOGGLE_MESSAGES.SUBSCRIBING })
    ).toBeDisabled();
  });

  it('ボタンクリックで subscribe を呼ぶ', async () => {
    mockSubscribe.mockResolvedValue({});
    render(<NotificationToggle />);

    fireEvent.click(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.PROMPT));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it('subscribe が失敗しても例外を外へ漏らさない', async () => {
    mockSubscribe.mockRejectedValue(new Error('ネットワークエラー'));
    render(<NotificationToggle />);

    fireEvent.click(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.PROMPT));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it('失敗時に permission が denied なら拒否メッセージだけを表示する', () => {
    setupHook({ permission: 'denied', error: new Error('通知が拒否されました') });
    render(<NotificationToggle />);

    expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.DENIED)).toBeInTheDocument();
    expect(screen.queryByText(NOTIFICATION_TOGGLE_MESSAGES.ERROR)).not.toBeInTheDocument();
  });

  it('失敗時に permission が denied 以外ならエラーメッセージを表示する', () => {
    setupHook({ permission: 'default', error: new Error('ネットワークエラー') });
    render(<NotificationToggle />);

    expect(screen.getByText(NOTIFICATION_TOGGLE_MESSAGES.ERROR)).toBeInTheDocument();
    expect(screen.queryByText(NOTIFICATION_TOGGLE_MESSAGES.DENIED)).not.toBeInTheDocument();
  });
});
