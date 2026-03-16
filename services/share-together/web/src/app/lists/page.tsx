'use client';

import { Suspense, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useSearchParams } from 'next/navigation';
import { ListWorkspace } from '@/components/ListWorkspace';
import type { PersonalListsResponse } from '@/types';

const LISTS_PAGE_MESSAGES = {
  PERSONAL_LISTS_FETCH_FAILED: '個人リスト一覧 API の取得に失敗しました',
  DEFAULT_LIST_NOT_FOUND: 'デフォルト個人リストが見つかりません',
  DEFAULT_LIST_LOAD_FAILED_NOTICE: 'デフォルト個人リストの取得に失敗しました。',
  LIST_LOADING_NOTICE: 'リストを読み込み中です...',
} as const;

export default function ListsPage() {
  return (
    <main>
      <Box component="section" sx={{ p: 2, maxWidth: 1080, mx: 'auto' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          リスト
        </Typography>
        <Suspense
          fallback={
            <Typography role="status" aria-live="polite">
              {LISTS_PAGE_MESSAGES.LIST_LOADING_NOTICE}
            </Typography>
          }
        >
          <ListsPageContent />
        </Suspense>
      </Box>
    </main>
  );
}

function ListsPageContent() {
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
          throw new Error(LISTS_PAGE_MESSAGES.DEFAULT_LIST_NOT_FOUND);
        }
        setDefaultListId(defaultList.listId);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        console.error(LISTS_PAGE_MESSAGES.PERSONAL_LISTS_FETCH_FAILED, { error });
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

  if (isLoading) {
    return (
      <Typography role="status" aria-live="polite">
        {LISTS_PAGE_MESSAGES.LIST_LOADING_NOTICE}
      </Typography>
    );
  }

  if (resolvedListId) {
    return (
      <ListWorkspace
        initialListId={resolvedListId}
        initialScope={scope}
        initialGroupId={initialGroupId}
      />
    );
  }

  return (
    <Typography color="error">{LISTS_PAGE_MESSAGES.DEFAULT_LIST_LOAD_FAILED_NOTICE}</Typography>
  );
}
