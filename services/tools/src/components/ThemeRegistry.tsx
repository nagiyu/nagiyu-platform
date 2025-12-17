'use client';

import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, AppBar, Toolbar, Typography } from '@mui/material';
import theme from '@/styles/theme';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* 簡易 Header */}
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1, textAlign: 'center' }}>
              Tools
            </Typography>
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
          {children}
        </Box>

        {/* 簡易 Footer */}
        <Box
          component="footer"
          sx={{
            py: 2,
            px: 2,
            mt: 'auto',
            backgroundColor: 'grey.200',
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            v1.0.0
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
