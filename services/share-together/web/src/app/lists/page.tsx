'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useSearchParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { ListWorkspace } from '@/components/ListWorkspace';
import type { PersonalListsResponse } from '@/types';

const ERROR_MESSAGES = {
  PERSONAL_LISTS_FETCH_FAILED: '個人リスト一覧 API の取得に失敗しました',
  DEFAULT_LIST_NOT_FOUND: 'デフォルト個人リストが見つかりません',
  DEFAULT_LIST_LOAD_FAILED_NOTICE: 'デフォルト個人リストの取得に失敗しました。',
} as const;

export default function ListsPage() {
  const searchParams = useSearchParams();
  const scope = searchParams.get('scope') === 'shared' ? 'shared' : 'personal';
  const initialGroupId = searchParams.get('groupId') ?? '';
  const listIdFromQuery = searchParams.get('listId') ?? '';
  const hasListIdFromQuery = listIdFromQuery.length > 0;
  const [defaultListId, setDefaultListId] = useState<string>('');
  const [isListLoading, setIsListLoading] = useState(!hasListIdFromQuery);

  useEffect(() => {
    if (hasListIdFromQuery) {
      return;
    }

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
        if (error instanceof DOMException && error.name === 'AbortError') {
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
  }, [hasListIdFromQuery]);

  const isLoading = hasListIdFromQuery ? false : isListLoading;
  const resolvedListId = hasListIdFromQuery ? listIdFromQuery : defaultListId;

  return (
    <main>
      <Navigation />
      <Box component="section" sx={{ p: 2, maxWidth: 1080, mx: 'auto' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          リスト
        </Typography>
        {isLoading ? (
          <Typography role="status" aria-live="polite">
            リストを読み込み中です...
          </Typography>
        ) : resolvedListId ? (
          <ListWorkspace
            initialListId={resolvedListId}
            initialScope={scope}
            initialGroupId={initialGroupId}
          />
        ) : (
          <Typography color="error">{ERROR_MESSAGES.DEFAULT_LIST_LOAD_FAILED_NOTICE}</Typography>
        )}
      </Box>
    </main>
  );
}
