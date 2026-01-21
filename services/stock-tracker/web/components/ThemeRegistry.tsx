'use client';

import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { SessionProvider, useSession, signOut } from 'next-auth/react';
import { theme, Header, Footer, NavigationItem } from '@nagiyu/ui';
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
    { label: '保有株式', href: '/holdings' },
    { label: 'ウォッチリスト', href: '/watchlist' },
    { label: 'アラート', href: '/alerts' },
    // 権限ベースの管理メニュー（stocks:manage-data 権限が必要）
    ...(session?.user?.roles && hasPermission(session.user.roles, 'stocks:manage-data')
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
        avatar: session.user.image,
      }
    : undefined;

  // ログアウトハンドラー
  const handleLogout = () => signOut();

  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorBoundary>
          <SnackbarProvider>
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
              <Header
                title="Stock Tracker"
                navigationItems={navigationItems}
                user={user}
                onLogout={handleLogout}
              />
              <Box component="main" sx={{ flexGrow: 1 }}>
                {children}
              </Box>
              <Footer version={version} />
            </Box>
          </SnackbarProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}

export default function ThemeRegistry({ children, version }: ThemeRegistryProps) {
  return (
    <SessionProvider>
      <ThemeRegistryContent version={version}>{children}</ThemeRegistryContent>
    </SessionProvider>
  );
}
