'use client';

import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { theme, Header, Footer } from '@nagiyu/ui';
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
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Header title='Tools' ariaLabel='Tools ホームページに戻る' />
          <Box component="main" sx={{ flexGrow: 1 }}>
            {children}
          </Box>
          <Footer version={version} />
        </Box>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
