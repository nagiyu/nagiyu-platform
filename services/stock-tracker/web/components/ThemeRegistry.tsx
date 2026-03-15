'use client';

import * as React from 'react';
import { SessionProvider, useSession, signOut } from 'next-auth/react';
import { ServiceLayout, type NavigationItem } from '@nagiyu/ui';
import { SnackbarProvider } from './SnackbarProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { hasPermission } from '@nagiyu/common';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version?: string;
}

function ThemeRegistryContent({ children, version = '1.0.0' }: ThemeRegistryProps) {
  const { data: session } = useSession();

  // ナビゲーションメニュー項目の定義
  const navigationItems: NavigationItem[] = [
    { label: 'チャート', href: '/' },
    ...(session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'stocks:read')
      ? [{ label: 'サマリー', href: '/summaries' }]
      : []),
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
  const handleLogout = () => signOut();

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

export default function ThemeRegistry({ children, version }: ThemeRegistryProps) {
  return (
    <SessionProvider>
      <ThemeRegistryContent version={version}>{children}</ThemeRegistryContent>
    </SessionProvider>
  );
}
