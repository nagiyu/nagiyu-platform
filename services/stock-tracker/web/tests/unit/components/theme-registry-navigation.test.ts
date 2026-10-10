/** @jest-environment jsdom */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ThemeRegistry from '../../../components/ThemeRegistry';

jest.mock('next-auth/react', () => {
  return {
    SessionProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ナビの出し分けとサインアウトの挙動は共通部品側でテスト済みのため、
// ここでは ThemeRegistry が SessionHeader に正しい props を渡していることを検証する。
// SessionHeader へ渡された props を記録して後から検証できるようにする。
interface CapturedNavigationItem {
  label: string;
  href: string;
  requiredPermission?: string;
  children?: CapturedNavigationItem[];
}
interface CapturedSessionHeaderProps {
  title?: string;
  authUrl?: string;
  navigationItems?: CapturedNavigationItem[];
}
let capturedHeaderProps: CapturedSessionHeaderProps | undefined;

jest.mock('@nagiyu/ui', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  ServiceLayout: ({
    children,
    headerSlot,
  }: {
    children: React.ReactNode;
    headerSlot?: React.ReactNode;
  }) => React.createElement(React.Fragment, null, headerSlot, children),
}));

jest.mock('@nagiyu/ui/session-provider', () => ({
  SessionHeader: (props: CapturedSessionHeaderProps) => {
    capturedHeaderProps = props;
    return null;
  },
}));

jest.mock('../../../components/SnackbarProvider', () => {
  return {
    SnackbarProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

function renderThemeRegistry(authUrl?: string): CapturedSessionHeaderProps {
  renderToStaticMarkup(
    React.createElement(ThemeRegistry, { authUrl }, React.createElement('div', null, 'child'))
  );
  if (!capturedHeaderProps) {
    throw new Error('SessionHeader がレンダリングされていません');
  }
  return capturedHeaderProps;
}

describe('ThemeRegistry の SessionHeader', () => {
  beforeEach(() => {
    capturedHeaderProps = undefined;
  });

  it('タイトルが Stock Tracker である', () => {
    expect(renderThemeRegistry().title).toBe('Stock Tracker');
  });

  it('authUrl をそのまま SessionHeader に渡す', () => {
    expect(renderThemeRegistry('http://localhost:3001').authUrl).toBe('http://localhost:3001');
  });

  it('authUrl 未指定のときは空文字を渡す', () => {
    expect(renderThemeRegistry().authUrl).toBe('');
  });

  it('権限を要求しない項目は requiredPermission なしで渡す', () => {
    const items = renderThemeRegistry().navigationItems;
    expect(items).toContainEqual({ label: 'チャート', href: '/' });
    expect(items).toContainEqual({ label: '保有株式', href: '/holdings' });
    expect(items).toContainEqual({ label: 'アラート', href: '/alerts' });
  });

  it('サマリーと判断軸の成績は stocks:read 権限を要求する', () => {
    const items = renderThemeRegistry().navigationItems;
    expect(items).toContainEqual({
      label: 'サマリー',
      href: '/summaries',
      requiredPermission: 'stocks:read',
    });
    expect(items).toContainEqual({
      label: '判断軸の成績',
      href: '/axis-performance',
      requiredPermission: 'stocks:read',
    });
  });

  it('管理メニューは stocks:manage-data 権限を要求し、取引所とティッカーを子に持つ', () => {
    const items = renderThemeRegistry().navigationItems;
    expect(items).toContainEqual({
      label: '管理',
      href: '#',
      requiredPermission: 'stocks:manage-data',
      children: [
        { label: '取引所', href: '/exchanges' },
        { label: 'ティッカー', href: '/tickers' },
      ],
    });
  });

  it('予測精度の導線は含まない', () => {
    const items = renderThemeRegistry().navigationItems;
    expect(items).not.toContainEqual(expect.objectContaining({ href: '/prediction-evaluation' }));
  });
});
