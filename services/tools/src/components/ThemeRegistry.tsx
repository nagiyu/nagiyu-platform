'use client';

import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { theme } from '@nagiyu/ui';
import MigrationDialog from '@/components/dialogs/MigrationDialog';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version?: string;
}

export default function ThemeRegistry({ children, version = '1.0.0' }: ThemeRegistryProps) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MigrationDialog />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
