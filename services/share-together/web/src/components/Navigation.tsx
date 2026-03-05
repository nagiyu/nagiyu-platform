'use client';

import { AppBar, Button, Toolbar, Typography } from '@mui/material';
import { InvitationBadge } from '@/components/InvitationBadge';

const NAV_ITEMS = [
  { label: 'ホーム', href: '/' },
  { label: 'リスト', href: '/lists' },
  { label: 'グループ', href: '/groups' },
] as const;

export function Navigation() {
  return (
    <AppBar position="sticky">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
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
