'use client';

import { AppBar, Toolbar, Typography } from '@mui/material';

export default function Header() {
  return (
    <AppBar position="static" color="primary">
      <Toolbar
        sx={{
          minHeight: { xs: 56, sm: 64 },
        }}
      >
        <Typography
          variant="h6"
          component="a"
          href="/"
          sx={{
            flexGrow: 1,
            textAlign: 'center',
            textDecoration: 'none',
            color: 'inherit',
            fontWeight: 600,
          }}
          aria-label="Tools ホームページに戻る"
        >
          Tools
        </Typography>
      </Toolbar>
    </AppBar>
  );
}
