'use client';

import { Suspense, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useSearchParams } from 'next/navigation';
import { ListWorkspace } from '@/components/ListWorkspace';
import { parseListsQuery } from '@/lib/listsQuery';
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
  // ListWorkspace が選択を URL へ書き戻すと searchParams が変わる。初回のクエリだけを取り込み、
  // 書き戻しで ListWorkspace の初期値が差し替わって状態や取得が作り直されるのを防ぐ。
  const [initialSelection] = useState(() => parseListsQuery(searchParams));
  const { scope, groupId: initialGroupId, listId: listIdFromQuery } = initialSelection;
  const hasListIdFromQuery = listIdFromQuery.length > 0;
  // 共有リストの ID は ListWorkspace が共有リスト一覧と突き合わせて補正するので、個人リストの一覧は要らない。
  // 個人リストの ID は、別の端末で削除された可能性があるため一覧と突き合わせる。
  const needsPersonalLists = scope === 'personal' || !hasListIdFromQuery;
  const [resolvedListId, setResolvedListId] = useState<string>(
    needsPersonalLists ? '' : listIdFromQuery
  );
  const [isLoading, setIsLoading] = useState(needsPersonalLists);

  useEffect(() => {
    if (!needsPersonalLists) {
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
        const { lists } = result.data;
        if (scope === 'personal' && lists.some((list) => list.listId === listIdFromQuery)) {
          setResolvedListId(listIdFromQuery);
          return;
        }

        const defaultList = lists.find((list) => list.isDefault);
        if (!defaultList) {
          throw new Error(LISTS_PAGE_MESSAGES.DEFAULT_LIST_NOT_FOUND);
        }
        setResolvedListId(defaultList.listId);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        console.error(LISTS_PAGE_MESSAGES.PERSONAL_LISTS_FETCH_FAILED, { error });
        // 一覧を取れなくても、クエリで指定されたリストはそのまま開く。
        // 存在しない場合は ToDo 取得のエラーとして画面に出る。
        if (hasListIdFromQuery) {
          setResolvedListId(listIdFromQuery);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [needsPersonalLists, scope, listIdFromQuery, hasListIdFromQuery]);

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
