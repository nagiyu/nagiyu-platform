'use client';

import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { theme, Header, Footer } from '@nagiyu/ui';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version?: string;
}

export default function ThemeRegistry({ children, version = '1.0.0' }: ThemeRegistryProps) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Header title="Codec Converter" ariaLabel="Codec Converter ホームページに戻る" />
          <Box component="main" sx={{ flexGrow: 1 }}>
            {children}
          </Box>
          <Footer version={version} />
        </Box>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
