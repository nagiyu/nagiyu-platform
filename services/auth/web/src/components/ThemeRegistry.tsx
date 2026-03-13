'use client';

import * as React from 'react';
import { Box } from '@mui/material';
import { AppLayout, Header, Footer } from '@nagiyu/ui';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version?: string;
}

export default function ThemeRegistry({ children, version = '1.0.0' }: ThemeRegistryProps) {
  return (
    <AppLayout>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header title="Auth" ariaLabel="Auth ホームページに戻る" />
        <Box component="main" sx={{ flexGrow: 1 }}>
          {children}
        </Box>
        <Footer version={version} />
      </Box>
    </AppLayout>
  );
}
