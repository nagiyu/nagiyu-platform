import '@testing-library/jest-dom';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { dynamic } from '@/app/layout';

const mockSessionHeader = jest.fn();

jest.mock('@nagiyu/ui', () => ({
  __esModule: true,
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

describe('RootLayout', () => {
  const originalAuthUrl = process.env.NEXT_PUBLIC_AUTH_URL;
  const originalAppVersion = process.env.APP_VERSION;

  beforeEach(() => {
    mockSessionHeader.mockClear();
  });

  afterEach(() => {
    if (originalAuthUrl === undefined) {
      delete process.env.NEXT_PUBLIC_AUTH_URL;
    } else {
      process.env.NEXT_PUBLIC_AUTH_URL = originalAuthUrl;
    }
    if (originalAppVersion === undefined) {
      delete process.env.APP_VERSION;
    } else {
      process.env.APP_VERSION = originalAppVersion;
    }
  });

  it('ランタイム env を読むため動的レンダリングを強制する', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('ヘッダーを SessionProvider の内側に描画し、子要素とバージョンも描画する', () => {
    process.env.APP_VERSION = '9.9.9';
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(html).toMatch(/data-testid="session-provider">.*SessionHeader/);
    expect(html).toContain('RootLayout Child');
    expect(html).toContain('9.9.9');
  });

  it('SessionHeader にタイトル・ariaLabel・authUrl を渡す', () => {
    process.env.NEXT_PUBLIC_AUTH_URL = 'https://auth.example.com';

    renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(mockSessionHeader).toHaveBeenCalledTimes(1);
    expect(mockSessionHeader.mock.calls[0][0]).toEqual({
      title: 'Admin',
      ariaLabel: 'Admin ホームページに戻る',
      authUrl: 'https://auth.example.com',
    });
  });

  it('NEXT_PUBLIC_AUTH_URL が未設定のとき authUrl は空文字になる', () => {
    delete process.env.NEXT_PUBLIC_AUTH_URL;

    renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(mockSessionHeader.mock.calls[0][0].authUrl).toBe('');
  });
});
