'use client';

import * as React from 'react';
import { Box } from '@mui/material';
import { AppLayout, Footer } from '@nagiyu/ui';
import { Navigation } from './Navigation';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version?: string;
}

export default function ThemeRegistry({ children, version = '0.1.0' }: ThemeRegistryProps) {
  return (
    <AppLayout>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navigation />
        <Box component="main" sx={{ flexGrow: 1 }}>
          {children}
        </Box>
        <Footer version={version} />
      </Box>
    </AppLayout>
  );
}
