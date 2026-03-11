'use client';

import { AppBar, Button, Toolbar, Typography } from '@mui/material';
import Link from 'next/link';
import { InvitationBadge } from '@/components/InvitationBadge';

const NAV_ITEMS = [
  { label: 'リスト', href: '/lists' },
  { label: 'グループ', href: '/groups' },
] as const;

export function Navigation() {
  return (
    <AppBar position="sticky">
      <Toolbar>
        <Typography
          variant="h6"
          component={Link}
          href="/"
          color="inherit"
          sx={{ flexGrow: 1, textDecoration: 'none' }}
        >
          Share Together
        </Typography>
        {NAV_ITEMS.map((item) => (
          <Button key={item.label} color="inherit" href={item.href}>
            {item.label}
          </Button>
        ))}
        <InvitationBadge />
      </Toolbar>
    </AppBar>
  );
}
