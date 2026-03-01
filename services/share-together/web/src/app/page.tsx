'use client';

import { Box, Typography } from '@mui/material';
import { useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { TodoList } from '@/components/TodoList';

export default function Home() {
  useEffect(() => {
    if (typeof globalThis.fetch !== 'function') {
      return;
    }

    void globalThis.fetch('/api/users', { method: 'POST' }).catch((error: unknown) => {
      console.error('ユーザー登録 API の自動実行に失敗しました', { error });
    });
  }, []);

  return (
    <main>
      <Navigation />
      <Box component="section" sx={{ p: 2, maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          デフォルト個人リスト
        </Typography>
        <TodoList />
      </Box>
    </main>
  );
}
