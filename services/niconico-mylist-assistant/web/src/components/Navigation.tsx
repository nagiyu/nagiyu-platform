'use client';

import { AppBar, Toolbar, Typography, Button } from '@mui/material';
import { useRouter } from 'next/navigation';

export function Navigation() {
  const router = useRouter();

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          niconico-mylist-assistant
        </Typography>
        <Button color="inherit" onClick={() => router.push('/')}>
          ホーム
        </Button>
        <Button color="inherit" onClick={() => router.push('/import')}>
          インポート
        </Button>
        <Button color="inherit" onClick={() => router.push('/mylist')}>
          動画管理
        </Button>
        <Button color="inherit" onClick={() => router.push('/register')}>
          マイリスト登録
        </Button>
        <Button color="inherit" onClick={() => router.push('/mylist/register')}>
          マイリスト登録
        </Button>
      </Toolbar>
    </AppBar>
  );
}
