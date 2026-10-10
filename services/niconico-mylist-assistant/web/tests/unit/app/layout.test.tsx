import '@testing-library/jest-dom';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { dynamic } from '@/app/layout';

const mockSessionHeader = jest.fn();

jest.mock('@nagiyu/ui', () => ({
  __esModule: true,
  ServiceWorkerRegistration: () => <div>ServiceWorkerRegistration</div>,
  ServiceLayout: ({
    children,
    headerSlot,
    footerProps,
  }: {
    children: React.ReactNode;
    headerSlot?: React.ReactNode;
    footerProps?: { version?: string };
  }) => (
    <div>
      {headerSlot}
      {children}
      <div>{footerProps?.version}</div>
    </div>
  ),
}));

jest.mock('@nagiyu/ui/session-provider', () => ({
  __esModule: true,
  SessionProviderWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
  SessionHeader: (props: Record<string, unknown>) => {
    mockSessionHeader(props);
    return <div>SessionHeader</div>;
  },
}));

// types/env.d.ts が環境変数を readonly で宣言しているため、テストでは書き換え可能な型で扱う
const env = process.env as Record<string, string | undefined>;

describe('RootLayout', () => {
  const originalAuthUrl = env.NEXT_PUBLIC_AUTH_URL;
  const originalAppVersion = env.APP_VERSION;

  beforeEach(() => {
    mockSessionHeader.mockClear();
  });

  afterEach(() => {
    if (originalAuthUrl === undefined) {
      delete env.NEXT_PUBLIC_AUTH_URL;
    } else {
      env.NEXT_PUBLIC_AUTH_URL = originalAuthUrl;
    }
    if (originalAppVersion === undefined) {
      delete env.APP_VERSION;
    } else {
      env.APP_VERSION = originalAppVersion;
    }
  });

  it('ランタイム env を読むため動的レンダリングを強制する', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('ヘッダーを SessionProvider の内側に描画し、子要素とバージョンも描画する', () => {
    env.APP_VERSION = '9.9.9';
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(html).toMatch(/data-testid="session-provider">.*SessionHeader/);
    expect(html).toContain('ServiceWorkerRegistration');
    expect(html).toContain('RootLayout Child');
    expect(html).toContain('9.9.9');
  });

  it('SessionHeader にタイトル・ariaLabel・ナビ・authUrl を渡す', () => {
    env.NEXT_PUBLIC_AUTH_URL = 'https://auth.example.com';

    renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(mockSessionHeader).toHaveBeenCalledTimes(1);
    expect(mockSessionHeader.mock.calls[0][0]).toEqual({
      title: 'Niconico Mylist Assistant',
      ariaLabel: 'Niconico Mylist Assistant ホームページに戻る',
      navigationItems: [
        { label: 'ホーム', href: '/' },
        { label: 'インポート', href: '/import' },
        { label: '動画一覧', href: '/mylist' },
        { label: 'マイリスト登録', href: '/mylist/register' },
      ],
      authUrl: 'https://auth.example.com',
    });
  });

  it('NEXT_PUBLIC_AUTH_URL が未設定のとき authUrl は空文字になる', () => {
    delete env.NEXT_PUBLIC_AUTH_URL;

    renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(mockSessionHeader.mock.calls[0][0].authUrl).toBe('');
  });
});
