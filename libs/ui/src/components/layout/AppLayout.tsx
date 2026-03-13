'use client';

import type { ReactNode } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, type Theme } from '@mui/material/styles';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import theme from '../../styles/theme';

export interface AppLayoutProps {
  children: ReactNode;
  themeOverride?: Theme;
}

export default function AppLayout({ children, themeOverride }: AppLayoutProps) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={themeOverride || theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
