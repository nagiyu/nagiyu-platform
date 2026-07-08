/**
 * LiveTalkHeader のユニットテスト。
 *
 * - ナビゲーション項目（私が覚えていること・ノート）が表示されること
 * - livetalk:admin ロールを持つ場合のみステータスが表示されること
 * - サインアウト・退会の導線が機能すること
 * - useAccountDeletion・buildSignOutUrl・window.location は副作用のためモック化する
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LiveTalkHeader from '@/components/LiveTalkHeader';

// buildSignOutUrl をモック化して引数を検証できるようにする
const mockBuildSignOutUrl = jest.fn((authUrl: string, callbackUrl?: string) => {
  const base = authUrl.replace(/\/+$/, '');
  const endpoint = `${base}/api/auth/signout`;
  if (!callbackUrl) return endpoint;
  return `${endpoint}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
});

jest.mock('@nagiyu/ui', () => {
  const actual = jest.requireActual('@nagiyu/ui');
  return {
    ...actual,
    buildSignOutUrl: (authUrl: string, callbackUrl?: string) =>
      mockBuildSignOutUrl(authUrl, callbackUrl),
  };
});

// useSession のモック。各テストで差し替えられるようモジュール変数で保持する。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseSession = jest.fn<any, any[]>(() => ({ data: null, status: 'unauthenticated' }));
jest.mock('next-auth/react', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useSession: (...args: any[]) => mockUseSession(...args),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// useAccountDeletion をモック化して副作用を分離する
const mockRequestDeletion = jest.fn();
const mockClearError = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseAccountDeletion = jest.fn<any, any[]>(() => ({
  loading: false,
  error: null as string | null,
  requestDeletion: mockRequestDeletion,
  clearError: mockClearError,
}));
jest.mock('@/lib/account/useAccountDeletion', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAccountDeletion: (...args: any[]) => mockUseAccountDeletion(...args),
}));

// AccountDeletionModal をモック化（開閉状態の検証のみ行う）
const mockAccountDeletionModal = jest.fn(
  ({ open, onCancel }: { open: boolean; onCancel: () => void }) =>
    open ? (
      <div data-testid="account-deletion-modal">
        <button onClick={onCancel} data-testid="modal-cancel">
          キャンセル
        </button>
      </div>
    ) : null
);
jest.mock('@/components/AccountDeletionModal', () => ({
  __esModule: true,
  default: (props: { open: boolean; onCancel: () => void }) => mockAccountDeletionModal(props),
}));

// window.location.assign の検証について:
// jsdom では window.location は configurable: false かつ assign は read only のため
// スパイやモックによる直接の上書きが困難。
// buildSignOutUrl をモックして引数を検証する方式を採用する（HomePageClient.test.tsx と同方式）。

afterEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' as const });
});

/** 未認証セッションを設定する */
function setupUnauthenticatedSession() {
  mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' as const });
}

/** 通常ユーザーセッションを設定する */
function setupUserSession(roles: string[] = ['livetalk-user']) {
  mockUseSession.mockReturnValue({
    data: {
      user: {
        id: 'user-1',
        name: 'テストユーザー',
        email: 'test@example.com',
        image: null,
        roles,
      },
      expires: '2099-01-01T00:00:00.000Z',
    },
    status: 'authenticated' as const,
  });
}

/** 管理者セッションを設定する。
 * ROLES の定義により 'livetalk-admin' ロールが 'livetalk:admin' パーミッションを持つ。
 */
function setupAdminSession() {
  setupUserSession(['livetalk-user', 'livetalk-admin']);
}

describe('ナビゲーション項目の表示', () => {
  it('未認証時でも「私が覚えていること」と「ノート」が表示される', async () => {
    setupUnauthenticatedSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    // ナビゲーションメニューにアイテムが表示されることを確認
    // デスクトップ向けは md 以上で表示されるが、テスト環境ではボタンがレンダリングされる
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '私が覚えていること' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ノート' })).toBeInTheDocument();
    });
  });

  it('「私が覚えていること」リンクが /memory へ向いている', async () => {
    setupUnauthenticatedSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: '私が覚えていること' });
      expect(link).toHaveAttribute('href', '/memory');
    });
  });

  it('「ノート」リンクが /notes へ向いている', async () => {
    setupUnauthenticatedSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'ノート' });
      expect(link).toHaveAttribute('href', '/notes');
    });
  });

  it('通常ユーザーには「ステータス」が表示されない', async () => {
    setupUserSession(['livetalk-user']);
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'ステータス' })).not.toBeInTheDocument();
    });
  });

  it('livetalk:admin ロールを持つユーザーには「ステータス」が表示される', async () => {
    setupAdminSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'ステータス' })).toBeInTheDocument();
    });
  });

  it('「ステータス」リンクが /status へ向いている', async () => {
    setupAdminSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'ステータス' });
      expect(link).toHaveAttribute('href', '/status');
    });
  });
});

describe('ログアウト導線', () => {
  it('認証済みのとき、アカウントメニューを開くとサインアウト項目が表示される', async () => {
    const user = userEvent.setup();
    setupUserSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    // アカウントメニューを開く
    const accountMenuButton = await screen.findByLabelText('アカウントメニュー');
    await user.click(accountMenuButton);

    // サインアウト項目が表示される
    await waitFor(() => {
      expect(screen.getByTestId('account-menu-logout')).toBeInTheDocument();
    });
  });

  it('サインアウト項目クリック時に authUrl が buildSignOutUrl の第一引数として渡される', async () => {
    const user = userEvent.setup();
    setupUserSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    const accountMenuButton = await screen.findByLabelText('アカウントメニュー');
    await user.click(accountMenuButton);

    const logoutItem = await screen.findByTestId('account-menu-logout');
    await user.click(logoutItem);

    expect(mockBuildSignOutUrl).toHaveBeenCalledWith('https://auth.nagiyu.com', expect.any(String));
  });

  it('サインアウト項目クリック時に buildSignOutUrl が生成した URL が正しい形式になる', async () => {
    const user = userEvent.setup();
    setupUserSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    const accountMenuButton = await screen.findByLabelText('アカウントメニュー');
    await user.click(accountMenuButton);

    const logoutItem = await screen.findByTestId('account-menu-logout');
    await user.click(logoutItem);

    // buildSignOutUrl が authUrl を受け取り signout URL を生成したことを確認する。
    // window.location.assign の呼び出し検証は jsdom の制約により直接テストが困難なため、
    // buildSignOutUrl のモックで入力値を検証する方式を採用する（HomePageClient.test.tsx と同方式）。
    expect(mockBuildSignOutUrl).toHaveBeenCalledWith('https://auth.nagiyu.com', expect.any(String));
    // 生成された URL が正しい形式であることを確認する
    const generatedUrl = mockBuildSignOutUrl.mock.results[0].value as string;
    expect(generatedUrl).toContain('/api/auth/signout');
  });
});

describe('退会・データ削除導線', () => {
  it('認証済みのとき、アカウントメニューを開くと退会項目が表示される', async () => {
    const user = userEvent.setup();
    setupUserSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    const accountMenuButton = await screen.findByLabelText('アカウントメニュー');
    await user.click(accountMenuButton);

    await waitFor(() => {
      expect(screen.getByTestId('account-menu-delete-account')).toBeInTheDocument();
    });
  });

  it('退会項目クリック時に AccountDeletionModal が開く', async () => {
    const user = userEvent.setup();
    setupUserSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    // 初期状態ではモーダルが閉じている
    expect(screen.queryByTestId('account-deletion-modal')).not.toBeInTheDocument();

    const accountMenuButton = await screen.findByLabelText('アカウントメニュー');
    await user.click(accountMenuButton);

    const deleteItem = await screen.findByTestId('account-menu-delete-account');
    await user.click(deleteItem);

    // モーダルが開く
    await waitFor(() => {
      expect(screen.getByTestId('account-deletion-modal')).toBeInTheDocument();
    });
  });

  it('退会項目クリック時に clearError が呼ばれる（残留エラーのクリア）', async () => {
    const user = userEvent.setup();
    setupUserSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    const accountMenuButton = await screen.findByLabelText('アカウントメニュー');
    await user.click(accountMenuButton);

    const deleteItem = await screen.findByTestId('account-menu-delete-account');
    await user.click(deleteItem);

    expect(mockClearError).toHaveBeenCalledTimes(1);
  });

  it('キャンセルボタンクリック時に AccountDeletionModal が閉じる', async () => {
    const user = userEvent.setup();
    setupUserSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    const accountMenuButton = await screen.findByLabelText('アカウントメニュー');
    await user.click(accountMenuButton);

    const deleteItem = await screen.findByTestId('account-menu-delete-account');
    await user.click(deleteItem);

    await waitFor(() => {
      expect(screen.getByTestId('account-deletion-modal')).toBeInTheDocument();
    });

    // キャンセルボタンでモーダルを閉じる
    await user.click(screen.getByTestId('modal-cancel'));

    await waitFor(() => {
      expect(screen.queryByTestId('account-deletion-modal')).not.toBeInTheDocument();
    });
  });
});

describe('ヘッダータイトル', () => {
  it('タイトルが「リブトーク」である', () => {
    setupUnauthenticatedSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    expect(screen.getByText('リブトーク')).toBeInTheDocument();
  });
});

describe('セッション情報の反映', () => {
  it('認証済みのとき、ユーザー名がアカウントメニューに表示される', async () => {
    const user = userEvent.setup();
    setupUserSession();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    const accountMenuButton = await screen.findByLabelText('アカウントメニュー');
    await user.click(accountMenuButton);

    await waitFor(() => {
      expect(screen.getByText('テストユーザー')).toBeInTheDocument();
    });
  });
});
