/** @jest-environment jsdom */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ThemeRegistry from '../../../components/ThemeRegistry';
import { useSession } from 'next-auth/react';

jest.mock('next-auth/react', () => {
  return {
    useSession: jest.fn(),
    SessionProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ログアウトハンドラーを ServiceLayout の onLogout として受け取るため、
// headerProps ごと記録して後から検証できるようにする
let capturedOnLogout: (() => void) | undefined;

// jest.mock のファクトリはホイスティングされるため、ファクトリ内で jest.fn() を定義し
// モジュールスコープに再代入する形でテストから参照できるようにする
// （ファクトリ外の変数をファクトリ内で参照すると TDZ エラーになる）
let mockBuildSignOutUrl: jest.Mock;

jest.mock('@nagiyu/ui', () => {
  // buildSignOutUrl は純粋関数のため実装をそのまま模倣し、呼び出しを記録する
  const fn = jest.fn((authUrl: string, callbackUrl?: string) => {
    const base = authUrl.replace(/\/+$/, '');
    const endpoint = `${base}/api/auth/signout`;
    if (callbackUrl === undefined || callbackUrl === '') {
      return endpoint;
    }
    return `${endpoint}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  });
  // ファクトリ外のモジュールスコープ変数に代入して beforeEach 等からアクセスできるようにする
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__mockBuildSignOutUrl = fn;

  return {
    buildSignOutUrl: fn,
    ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    ServiceLayout: ({
      children,
      headerProps,
    }: {
      children: React.ReactNode;
      headerProps?: { navigationItems?: unknown; onLogout?: () => void };
    }) => {
      capturedOnLogout = headerProps?.onLogout;
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'pre',
          { 'data-testid': 'navigation-items' },
          JSON.stringify(headerProps?.navigationItems)
        ),
        children
      );
    },
  };
});

jest.mock('../../../components/SnackbarProvider', () => {
  return {
    SnackbarProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

beforeAll(() => {
  // jest.mock ファクトリ実行後に globalThis 経由でモック関数を取得する
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockBuildSignOutUrl = (globalThis as any).__mockBuildSignOutUrl;
});

describe('ThemeRegistry navigationItems', () => {
  const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>;
  const getNavigationItems = (html: string): Array<{ label: string; href: string }> => {
    const matched = html.match(/<pre data-testid="navigation-items">(.+)<\/pre>/);
    if (!matched) {
      return [];
    }
    return JSON.parse(matched[1].replace(/&quot;/g, '"'));
  };

  beforeEach(() => {
    capturedOnLogout = undefined;
    mockBuildSignOutUrl.mockClear();
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: jest.fn(),
    });
  });

  it('stock-viewer ロール（stocks:read 権限あり）の場合にサマリー導線を表示する', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          name: 'test-user',
          email: 'test@example.com',
          roles: ['stock-viewer'],
        },
        expires: '2099-01-01T00:00:00.000Z',
      },
      status: 'authenticated',
      update: jest.fn(),
    });

    const html = renderToStaticMarkup(
      React.createElement(ThemeRegistry, null, React.createElement('div', null, 'child'))
    );
    const navigationItems = getNavigationItems(html);
    expect(navigationItems).toContainEqual({ label: 'サマリー', href: '/summaries' });
  });

  it('user-manager ロール（stocks:read 権限なし）の場合にサマリー導線を表示しない', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          name: 'test-user',
          email: 'test@example.com',
          roles: ['user-manager'],
        },
        expires: '2099-01-01T00:00:00.000Z',
      },
      status: 'authenticated',
      update: jest.fn(),
    });

    const html = renderToStaticMarkup(
      React.createElement(ThemeRegistry, null, React.createElement('div', null, 'child'))
    );
    const navigationItems = getNavigationItems(html);
    expect(navigationItems).not.toContainEqual({ label: 'サマリー', href: '/summaries' });
  });
});

describe('ThemeRegistry ログアウトハンドラー', () => {
  const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>;

  beforeEach(() => {
    capturedOnLogout = undefined;
    mockBuildSignOutUrl.mockClear();
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: jest.fn(),
    });
  });

  it('ログアウト時に buildSignOutUrl が auth URL と現在の origin を引数に呼ばれる', () => {
    // jsdom では window.location の assign / origin は non-configurable のため
    // Object.defineProperty や jest.spyOn でモックできない。
    // ここでは ThemeRegistry が buildSignOutUrl を正しい引数（AUTH_URL, window.location.origin）で
    // 呼び出すことをテストし、ナビゲーション副作用（assign の呼び出し）は検証スコープ外とする。
    // （assign 呼び出し自体は jest-environment-jsdom で "Not implemented: navigation" の
    //   コンソールエラーになるが、テストの合否には影響しない。）
    process.env.NEXT_PUBLIC_AUTH_URL = 'http://localhost:3001';

    renderToStaticMarkup(
      React.createElement(ThemeRegistry, null, React.createElement('div', null, 'child'))
    );

    expect(capturedOnLogout).toBeDefined();

    // jsdom のデフォルト origin は 'http://localhost'
    // capturedOnLogout() を呼ぶと assign が実行されるが jsdom が警告を出すのみで失敗しない
    expect(() => capturedOnLogout!()).not.toThrow();

    expect(mockBuildSignOutUrl).toHaveBeenCalledWith('http://localhost:3001', 'http://localhost');
  });
});
