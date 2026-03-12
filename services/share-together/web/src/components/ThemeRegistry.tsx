'use client';

import * as React from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';

interface ThemeRegistryProps {
  children: React.ReactNode;
}

const PRIMARY_COLOR = '#1565c0';

const theme = createTheme({
  palette: {
    primary: {
      main: PRIMARY_COLOR,
    },
  },
});

export default function ThemeRegistry({ children }: ThemeRegistryProps) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
