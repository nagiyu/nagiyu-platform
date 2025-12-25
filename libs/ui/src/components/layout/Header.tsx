'use client';

import { AppBar, Toolbar, Typography } from '@mui/material';

export interface HeaderProps {
  /**
   * The title to display in the header
   * @default "Nagiyu Platform"
   */
  title?: string;
  /**
   * The href to navigate to when clicking the title
   * @default "/"
   */
  href?: string;
}

export default function Header({ title = 'Nagiyu Platform', href = '/' }: HeaderProps) {
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
          href={href}
          sx={{
            flexGrow: 1,
            textAlign: 'center',
            textDecoration: 'none',
            color: 'inherit',
            fontWeight: 600,
          }}
          aria-label={`${title} ホームページに戻る`}
        >
          {title}
        </Typography>
      </Toolbar>
    </AppBar>
  );
}
