'use client';

import * as React from 'react';
import { SessionProvider, useSession } from 'next-auth/react';
import { ErrorBoundary, ServiceLayout, buildSignOutUrl, type NavigationItem } from '@nagiyu/ui';
import { SnackbarProvider } from './SnackbarProvider';
import { hasPermission } from '@nagiyu/common';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version?: string;
  /** サインアウト URL の生成に使う auth サービスの URL。
   *  client component 内で process.env.NEXT_PUBLIC_AUTH_URL を参照すると
   *  ビルド時インライン化により空文字になるため、サーバーコンポーネント（layout.tsx）で
   *  ランタイム env から解決して prop として受け取る。 */
  authUrl?: string;
}

function ThemeRegistryContent({ children, version = '1.0.0', authUrl = '' }: ThemeRegistryProps) {
  const { data: session } = useSession();

  const hasStocksRead =
    !!session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'stocks:read');

  const hasReadEvaluation =
    !!session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'stocks:read-evaluation');

  // ナビゲーションメニュー項目の定義
  const navigationItems: NavigationItem[] = [
    { label: 'チャート', href: '/' },
    ...(hasStocksRead ? [{ label: 'サマリー', href: '/summaries' }] : []),
    ...(hasReadEvaluation ? [{ label: '予測精度', href: '/prediction-evaluation' }] : []),
    { label: '保有株式', href: '/holdings' },
    { label: 'アラート', href: '/alerts' },
    // 権限ベースの管理メニュー（stocks:manage-data 権限が必要）
    ...(session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'stocks:manage-data')
      ? [
          {
            label: '管理',
            href: '#',
            children: [
              { label: '取引所', href: '/exchanges' },
              { label: 'ティッカー', href: '/tickers' },
            ],
          },
        ]
      : []),
  ];

  // ユーザー情報
  const user = session?.user
    ? {
        name: session.user.name || '',
        email: session.user.email || '',
        avatar: 'image' in session.user && session.user.image ? session.user.image : undefined,
      }
    : undefined;

  // ログアウトハンドラー
  // サインアウトは Cookie 発行元の auth サービスに集約する方針のため、
  // buildSignOutUrl で生成した auth サービスの URL へ遷移させる。
  // authUrl はサーバーコンポーネント（layout.tsx）でランタイム env から解決して prop で受け取る。
  // client component 内で process.env.NEXT_PUBLIC_AUTH_URL を直接参照すると
  // ビルド時インライン化により空文字になり、相対 URL 化してサインアウトが失敗するため。
  const handleLogout = () =>
    window.location.assign(buildSignOutUrl(authUrl, window.location.origin));

  return (
    <ErrorBoundary>
      <SnackbarProvider>
        <ServiceLayout
          headerProps={{
            title: 'Stock Tracker',
            navigationItems,
            user,
            onLogout: handleLogout,
          }}
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
