/**
 * HomePageClient のユニットテスト。
 *
 * ログインリンクの href が authUrl prop から正しく生成されることを検証する。
 * - authUrl prop が `${authUrl}/signin?callbackUrl=...` の形で href に使われること
 * - client component 内で process.env.NEXT_PUBLIC_AUTH_URL を直読みしなくなったこと
 *   を、props のみでレンダリング内容が決定されることで間接的に確認する
 *
 * 背景:
 * NEXT_PUBLIC_AUTH_URL はビルド時にクライアントバンドルへインライン化されるが、
 * Docker ビルドに build-arg として渡していないため client component 内で読むと
 * ブラウザで空になる。サーバーコンポーネント（page.tsx）でランタイム env を解決し
 * prop として渡すことでこの問題を回避している。
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomePageClient from '../../../src/components/HomePageClient';

// subscribe のモック関数をテストから参照できるよう外部変数として保持する
const mockSubscribe = jest.fn();

// usePushSubscription を最小スタブ化（push 通知 API への依存を排除）
jest.mock('@nagiyu/react', () => ({
  usePushSubscription: jest.fn(() => ({
    subscribed: false,
    subscribe: mockSubscribe,
  })),
}));

// fetchVapidPublicKey をスタブ化
jest.mock('@nagiyu/browser', () => ({
  fetchVapidPublicKey: jest.fn(),
}));

// @nagiyu/ui の Button をシンプルなスタブにする（MUI 依存を最小化）
// asChild / startIcon 等の非標準 prop は void で明示的に無視し DOM に渡さない
jest.mock('@nagiyu/ui', () => ({
  Button: ({
    children,
    asChild,
    startIcon,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    startIcon?: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => {
    void asChild;
    void startIcon;
    return (
      <button onClick={onClick} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    );
  },
}));

// NotificationPermissionDialog をスタブ化（open/onClose/onRequestPermission を検証可能にする）
const mockOnClose = jest.fn();
const mockOnRequestPermission = jest.fn();

jest.mock('../../../src/components/NotificationPermissionButton', () => ({
  __esModule: true,
  default: jest.fn(
    ({
      open,
      onClose,
      onRequestPermission,
    }: {
      open: boolean;
      isSubscribed: boolean;
      onClose: () => void;
      onRequestPermission: () => void;
    }) => {
      // テストから onClose/onRequestPermission を呼び出せるよう参照を保持する
      mockOnClose.mockImplementation(onClose);
      mockOnRequestPermission.mockImplementation(onRequestPermission);
      return open ? (
        <div data-testid="notification-dialog">
          <button data-testid="dialog-close" onClick={onClose}>
            閉じる
          </button>
          <button data-testid="dialog-request" onClick={onRequestPermission}>
            通知を有効にする
          </button>
        </div>
      ) : null;
    }
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // fetch をモック化（subscribe 経由で postSubscription が呼ばれる場合に備える）
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  // window.alert をモック化（jsdom は alert を実装しない）
  global.alert = jest.fn();
  // Notification API を jsdom に追加（canUseNotificationApi が true になるよう）
  Object.defineProperty(window, 'Notification', {
    value: {},
    writable: true,
    configurable: true,
  });
});

describe('HomePageClient ログインリンク', () => {
  it('未認証時に authUrl prop を使ったログインリンクが描画される', () => {
    render(
      <HomePageClient
        isAuthenticated={false}
        appUrl="https://niconico.nagiyu.com"
        authUrl="https://auth.nagiyu.com"
      />
    );

    const loginLink = screen.getByRole('link', { name: 'ログイン' });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute(
      'href',
      'https://auth.nagiyu.com/signin?callbackUrl=https%3A%2F%2Fniconico.nagiyu.com'
    );
  });

  it('authUrl が空文字のとき href が相対 URL になる（ビルド時インライン化バグ相当）', () => {
    // 空文字 authUrl は、Docker ビルドに build-arg を渡さなかった場合の再現
    // サーバーコンポーネントで正しい authUrl を渡すことで回避される
    render(
      <HomePageClient isAuthenticated={false} appUrl="https://niconico.nagiyu.com" authUrl="" />
    );

    const loginLink = screen.getByRole('link', { name: 'ログイン' });
    expect(loginLink).toHaveAttribute(
      'href',
      '/signin?callbackUrl=https%3A%2F%2Fniconico.nagiyu.com'
    );
  });

  it('認証済みのときはログインリンクが描画されない', () => {
    render(
      <HomePageClient
        isAuthenticated={true}
        userName="テストユーザー"
        appUrl="https://niconico.nagiyu.com"
        authUrl="https://auth.nagiyu.com"
      />
    );

    expect(screen.queryByRole('link', { name: 'ログイン' })).not.toBeInTheDocument();
  });

  it('認証済みのときユーザー名が表示される', () => {
    render(
      <HomePageClient
        isAuthenticated={true}
        userName="ニコニコ太郎"
        appUrl="https://niconico.nagiyu.com"
        authUrl="https://auth.nagiyu.com"
      />
    );

    expect(screen.getByText('ようこそ、ニコニコ太郎 さん')).toBeInTheDocument();
  });

  it('callbackUrl に appUrl が URL エンコードされて含まれる', () => {
    render(
      <HomePageClient
        isAuthenticated={false}
        appUrl="http://localhost:3000"
        authUrl="http://localhost:3001"
      />
    );

    const loginLink = screen.getByRole('link', { name: 'ログイン' });
    expect(loginLink).toHaveAttribute(
      'href',
      'http://localhost:3001/signin?callbackUrl=http%3A%2F%2Flocalhost%3A3000'
    );
  });
});

describe('HomePageClient ナビゲーションリンク', () => {
  it('認証済みのとき「マイリスト登録」ボタンが /mylist/register を指す', () => {
    render(
      <HomePageClient
        isAuthenticated={true}
        userName="テストユーザー"
        appUrl="https://niconico.nagiyu.com"
        authUrl="https://auth.nagiyu.com"
      />
    );

    // 実ルートは src/app/mylist/register に存在する。
    // 過去に /register を指しており 404 になっていたため、誤リンクの回帰を防ぐ。
    const registerLink = screen.getByRole('link', { name: 'マイリスト登録' });
    expect(registerLink).toHaveAttribute('href', '/mylist/register');
  });

  it('認証済みのとき「動画インポート」「動画管理」が実ルートを指す', () => {
    render(
      <HomePageClient
        isAuthenticated={true}
        userName="テストユーザー"
        appUrl="https://niconico.nagiyu.com"
        authUrl="https://auth.nagiyu.com"
      />
    );

    expect(screen.getByRole('link', { name: '動画インポート' })).toHaveAttribute('href', '/import');
    expect(screen.getByRole('link', { name: '動画管理' })).toHaveAttribute('href', '/mylist');
  });
});

describe('HomePageClient 通知ダイアログ', () => {
  it('通知設定ボタンをクリックするとダイアログが開く', () => {
    render(
      <HomePageClient
        isAuthenticated={true}
        userName="テストユーザー"
        appUrl="https://niconico.nagiyu.com"
        authUrl="https://auth.nagiyu.com"
      />
    );

    // ダイアログは最初閉じている
    expect(screen.queryByTestId('notification-dialog')).not.toBeInTheDocument();

    // 通知設定ボタンをクリック
    const notificationButton = screen.getByText('通知設定');
    fireEvent.click(notificationButton);

    // ダイアログが開く
    expect(screen.getByTestId('notification-dialog')).toBeInTheDocument();
  });

  it('ダイアログの閉じるボタンでダイアログが閉じる', () => {
    render(
      <HomePageClient
        isAuthenticated={true}
        userName="テストユーザー"
        appUrl="https://niconico.nagiyu.com"
        authUrl="https://auth.nagiyu.com"
      />
    );

    // ダイアログを開く
    fireEvent.click(screen.getByText('通知設定'));
    expect(screen.getByTestId('notification-dialog')).toBeInTheDocument();

    // 閉じるボタンをクリック
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(screen.queryByTestId('notification-dialog')).not.toBeInTheDocument();
  });

  it('通知を有効にするボタンクリックで subscribe が呼ばれ成功時に alert が表示される', async () => {
    mockSubscribe.mockResolvedValue(undefined);

    render(
      <HomePageClient
        isAuthenticated={true}
        userName="テストユーザー"
        appUrl="https://niconico.nagiyu.com"
        authUrl="https://auth.nagiyu.com"
      />
    );

    // ダイアログを開く
    fireEvent.click(screen.getByText('通知設定'));

    // 通知を有効にするボタンをクリック
    fireEvent.click(screen.getByTestId('dialog-request'));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(global.alert).toHaveBeenCalledWith('通知が有効になりました！');
    });

    // ダイアログが閉じる
    expect(screen.queryByTestId('notification-dialog')).not.toBeInTheDocument();
  });

  it('subscribe が失敗した場合にエラーメッセージを alert で表示する', async () => {
    mockSubscribe.mockRejectedValue(new Error('通知権限が拒否されました'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <HomePageClient
        isAuthenticated={true}
        userName="テストユーザー"
        appUrl="https://niconico.nagiyu.com"
        authUrl="https://auth.nagiyu.com"
      />
    );

    // ダイアログを開く
    fireEvent.click(screen.getByText('通知設定'));

    // 通知を有効にするボタンをクリック
    fireEvent.click(screen.getByTestId('dialog-request'));

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(
        '通知の有効化に失敗しました: 通知権限が拒否されました'
      );
    });

    consoleSpy.mockRestore();
  });
});
