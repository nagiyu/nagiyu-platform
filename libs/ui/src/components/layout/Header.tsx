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
  /**
   * The aria-label for accessibility
   * @default "{title} - Navigate to homepage"
   */
  ariaLabel?: string;
}

export default function Header({ title = 'Nagiyu Platform', href = '/', ariaLabel }: HeaderProps) {
  const defaultAriaLabel = `${title} - Navigate to homepage`;
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
          aria-label={ariaLabel || defaultAriaLabel}
        >
          {title}
        </Typography>
      </Toolbar>
    </AppBar>
  );
}
