'use client';

import * as React from 'react';
import { SessionProvider } from 'next-auth/react';
import { ErrorBoundary, ServiceLayout, type NavigationItem } from '@nagiyu/ui';
import { SessionHeader } from '@nagiyu/ui/session-provider';
import { SnackbarProvider } from './SnackbarProvider';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version?: string;
  /** サインアウト URL の生成に使う auth サービスの URL。
   *  client component 内で process.env.NEXT_PUBLIC_AUTH_URL を参照すると
   *  ビルド時インライン化により空文字になるため、サーバーコンポーネント（layout.tsx）で
   *  ランタイム env から解決して prop として受け取る。 */
  authUrl?: string;
}

/**
 * ナビゲーション項目。
 * 権限による出し分けは Header が requiredPermission を見て行うため、ここでは静的に持つ。
 */
const NAVIGATION_ITEMS: NavigationItem[] = [
  { label: 'チャート', href: '/' },
  { label: 'サマリー', href: '/summaries', requiredPermission: 'stocks:read' },
  { label: '判断軸の成績', href: '/axis-performance', requiredPermission: 'stocks:read' },
  { label: '保有株式', href: '/holdings' },
  { label: 'アラート', href: '/alerts' },
  {
    label: '管理',
    href: '#',
    requiredPermission: 'stocks:manage-data',
    children: [
      { label: '取引所', href: '/exchanges' },
      { label: 'ティッカー', href: '/tickers' },
    ],
  },
];

function ThemeRegistryContent({ children, version = '1.0.0', authUrl = '' }: ThemeRegistryProps) {
  return (
    <ErrorBoundary>
      <SnackbarProvider>
        <ServiceLayout
          headerSlot={
            <SessionHeader
              title="Stock Tracker"
              navigationItems={NAVIGATION_ITEMS}
              authUrl={authUrl}
            />
          }
          footerProps={{ version }}
        >
          {children}
        </ServiceLayout>
      </SnackbarProvider>
    </ErrorBoundary>
  );
}

export default function ThemeRegistry({ children, version, authUrl }: ThemeRegistryProps) {
  return (
    <SessionProvider>
      <ThemeRegistryContent version={version} authUrl={authUrl}>
        {children}
      </ThemeRegistryContent>
    </SessionProvider>
  );
}
