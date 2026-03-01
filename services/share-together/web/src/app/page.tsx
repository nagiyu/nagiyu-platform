'use client';

import { Box, Typography } from '@mui/material';
import { useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { TodoList } from '@/components/TodoList';

const REGISTRATION_COMPLETED_KEY = 'share-together:user-registration-completed';
const ERROR_MESSAGES = {
  USER_REGISTRATION_AUTO_CALL_FAILED: 'ユーザー登録 API の自動実行に失敗しました',
} as const;

export default function Home() {
  useEffect(() => {
    if (window.sessionStorage.getItem(REGISTRATION_COMPLETED_KEY) === 'true') {
      return;
    }

    void window
      .fetch('/api/users', { method: 'POST' })
      .then((response) => {
        if (response.ok) {
          window.sessionStorage.setItem(REGISTRATION_COMPLETED_KEY, 'true');
          return;
        }

        throw new Error(`status: ${response.status}`);
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.USER_REGISTRATION_AUTO_CALL_FAILED, { error });
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
