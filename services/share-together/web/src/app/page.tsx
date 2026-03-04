'use client';

import { Box, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { TodoList } from '@/components/TodoList';
import type { PersonalListsResponse } from '@/types';

const REGISTRATION_COMPLETED_KEY = 'share-together:user-registration-completed';
const ERROR_MESSAGES = {
  USER_REGISTRATION_AUTO_CALL_FAILED: 'ユーザー登録 API の自動実行に失敗しました',
  PERSONAL_LISTS_FETCH_FAILED: '個人リスト一覧 API の取得に失敗しました',
  DEFAULT_LIST_NOT_FOUND: 'デフォルト個人リストが見つかりません',
  DEFAULT_LIST_LOAD_FAILED_NOTICE: 'デフォルト個人リストの取得に失敗しました。',
} as const;

export default function Home() {
  const [defaultListId, setDefaultListId] = useState<string | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);

  useEffect(() => {
    const initializeTodoList = async (): Promise<void> => {
      if (window.sessionStorage.getItem(REGISTRATION_COMPLETED_KEY) !== 'true') {
        try {
          const userResponse = await globalThis.fetch('/api/users', { method: 'POST' });
          if (userResponse.ok) {
            window.sessionStorage.setItem(REGISTRATION_COMPLETED_KEY, 'true');
          } else {
            throw new Error(`status: ${userResponse.status}`);
          }
        } catch (error: unknown) {
          console.error(ERROR_MESSAGES.USER_REGISTRATION_AUTO_CALL_FAILED, { error });
        }
      }

      try {
        const response = await globalThis.fetch('/api/lists');
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }

        const result = (await response.json()) as PersonalListsResponse;
        const defaultList = result.data.lists.find((list) => list.isDefault);
        if (!defaultList) {
          throw new Error(ERROR_MESSAGES.DEFAULT_LIST_NOT_FOUND);
        }

        setDefaultListId(defaultList.listId);
      } catch (error: unknown) {
        setDefaultListId(null);
        console.error(ERROR_MESSAGES.PERSONAL_LISTS_FETCH_FAILED, { error });
      } finally {
        setIsListLoading(false);
      }
    };

    void initializeTodoList();
  }, []);

  return (
    <main>
      <Navigation />
      <Box component="section" sx={{ p: 2, maxWidth: 720, mx: 'auto' }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          デフォルト個人リスト
        </Typography>
        {defaultListId && !isListLoading && <TodoList listId={defaultListId} apiEnabled />}
        {!defaultListId && isListLoading && (
          <Typography role="status" aria-live="polite">
            ToDoリストを読み込み中です...
          </Typography>
        )}
        {!defaultListId && !isListLoading && (
          <Typography color="error">{ERROR_MESSAGES.DEFAULT_LIST_LOAD_FAILED_NOTICE}</Typography>
        )}
      </Box>
    </main>
  );
}
