import '@testing-library/jest-dom';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { dynamic, metadata } from '@/app/layout';

const mockSessionHeader = jest.fn();
const mockServiceWorkerRegistration = jest.fn();

jest.mock('@nagiyu/react', () => ({
  __esModule: true,
  ServiceWorkerRegistration: (props: Record<string, unknown>) => {
    mockServiceWorkerRegistration(props);
    return <div>ServiceWorkerRegistration</div>;
  },
}));

jest.mock('@nagiyu/ui', () => ({
  __esModule: true,
  ...jest.requireActual('@nagiyu/ui'),
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
      <div>ServiceLayout</div>
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

jest.mock('@/components/InvitationBadge', () => ({
  InvitationBadge: () => <div>InvitationBadge</div>,
}));

jest.mock('@/components/UserRegistrationInitializer', () => ({
  __esModule: true,
  default: () => <div>UserRegistrationInitializer</div>,
}));

jest.mock('@/components/LastVisitedPathController', () => ({
  __esModule: true,
  default: () => <div>LastVisitedPathController</div>,
}));

describe('RootLayout', () => {
  const originalAuthUrl = process.env.NEXT_PUBLIC_AUTH_URL;

  beforeEach(() => {
    mockSessionHeader.mockClear();
    mockServiceWorkerRegistration.mockClear();
  });

  afterEach(() => {
    if (originalAuthUrl === undefined) {
      delete process.env.NEXT_PUBLIC_AUTH_URL;
    } else {
      process.env.NEXT_PUBLIC_AUTH_URL = originalAuthUrl;
    }
  });

  it('manifest.json をメタデータに設定する', () => {
    expect(metadata.manifest).toBe('/manifest.json');
  });

  it('ランタイム env を読むため動的レンダリングを強制する', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('ServiceWorkerRegistration・UserRegistrationInitializer と子要素を描画する', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(html).toContain('ServiceWorkerRegistration');
    expect(html).toContain('UserRegistrationInitializer');
    expect(html).toContain('LastVisitedPathController');
    expect(html).toContain('RootLayout Child');
    expect(html).toContain('1.0.0');
  });

  it('Service Worker の登録だけを行い、再購読は行わない', () => {
    renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    // share-together の sw.js は Push を持たないため、再購読を有効にしない
    expect(mockServiceWorkerRegistration).toHaveBeenCalledTimes(1);
    expect(mockServiceWorkerRegistration.mock.calls[0][0]).toEqual({});
  });

  it('ヘッダーを SessionProvider の内側に描画する', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(html).toMatch(/data-testid="session-provider">.*SessionHeader/);
  });

  it('SessionHeader にタイトル・ナビ・招待バッジ・authUrl を渡す', () => {
    process.env.NEXT_PUBLIC_AUTH_URL = 'https://auth.example.com';

    renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(mockSessionHeader).toHaveBeenCalledTimes(1);
    const props = mockSessionHeader.mock.calls[0][0];
    expect(props.title).toBe('Share Together');
    expect(props.ariaLabel).toBe('Share Together ホームページに戻る');
    expect(props.navigationItems).toEqual([
      { label: 'リスト', href: '/lists' },
      { label: 'グループ', href: '/groups' },
    ]);
    expect(renderToStaticMarkup(props.actions)).toContain('InvitationBadge');
    expect(props.authUrl).toBe('https://auth.example.com');
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
