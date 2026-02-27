'use client';

import { AppBar, Badge, Button, Toolbar, Typography } from '@mui/material';

const NAV_ITEMS = [
  { label: 'ホーム', href: '/' },
  { label: 'リスト', href: '/lists/mock-list' },
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
        <Button color="inherit" href="/invitations">
          <Badge badgeContent={0} color="secondary" showZero>
            招待
          </Badge>
        </Button>
      </Toolbar>
    </AppBar>
  );
}
