'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Navigation } from '@/components/Navigation';
import { ListWorkspace } from '@/components/ListWorkspace';
import type { PersonalListsResponse } from '@/types';

const ERROR_MESSAGES = {
  PERSONAL_LISTS_FETCH_FAILED: '個人リスト一覧 API の取得に失敗しました',
  DEFAULT_LIST_NOT_FOUND: 'デフォルト個人リストが見つかりません',
  DEFAULT_LIST_LOAD_FAILED_NOTICE: 'デフォルト個人リストの取得に失敗しました。',
} as const;

export default function ListsPage() {
  const [defaultListId, setDefaultListId] = useState<string>('');
  const [isListLoading, setIsListLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    void globalThis
      .fetch('/api/lists', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }

        const result = (await response.json()) as PersonalListsResponse;
        const defaultList = result.data.lists.find((list) => list.isDefault);
        if (!defaultList) {
          throw new Error(ERROR_MESSAGES.DEFAULT_LIST_NOT_FOUND);
        }
        setDefaultListId(defaultList.listId);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error(ERROR_MESSAGES.PERSONAL_LISTS_FETCH_FAILED, { error });
      })
      .finally(() => {
        setIsListLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main>
      <Navigation />
      <Box component="section" sx={{ p: 2, maxWidth: 1080, mx: 'auto' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          リスト
        </Typography>
        {isListLoading ? (
          <Typography role="status" aria-live="polite">
            リストを読み込み中です...
          </Typography>
        ) : defaultListId ? (
          <ListWorkspace initialListId={defaultListId} />
        ) : (
          <Typography color="error">{ERROR_MESSAGES.DEFAULT_LIST_LOAD_FAILED_NOTICE}</Typography>
        )}
      </Box>
    </main>
  );
}
