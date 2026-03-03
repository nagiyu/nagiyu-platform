import { Navigation } from '@/components/Navigation';
import { TodoList } from '@/components/TodoList';
import { ListSidebar } from '@/components/ListSidebar';
import type { GroupListsResponse } from '@/types';
import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { headers } from 'next/headers';

const ERROR_MESSAGES = {
  GROUP_LISTS_FETCH_FAILED: 'グループ共有リスト一覧の取得に失敗しました',
  API_RESPONSE_STATUS_ERROR: 'APIレスポンスのステータスが異常です',
} as const;

const DEFAULT_LIST_NAME = 'グループ共有リスト詳細';

type SidebarList = {
  listId: string;
  name: string;
};

async function resolveGroupLists(
  groupId: string,
  listId: string
): Promise<{ listName: string; lists: SidebarList[] }> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
    if (!host) {
      return { listName: DEFAULT_LIST_NAME, lists: [] };
    }

    const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
    const response = await fetch(
      `${protocol}://${host}/api/groups/${encodeURIComponent(groupId)}/lists`,
      { cache: 'no-store' }
    );
    if (!response.ok) {
      throw new Error(`${ERROR_MESSAGES.API_RESPONSE_STATUS_ERROR}: ${response.status}`);
    }

    const result = (await response.json()) as GroupListsResponse;
    const lists = result.data.lists.map((list) => ({
      listId: list.listId,
      name: list.name,
    }));

    const targetList = lists.find((list) => list.listId === listId);
    return { listName: targetList?.name ?? DEFAULT_LIST_NAME, lists };
  } catch (error: unknown) {
    console.error(ERROR_MESSAGES.GROUP_LISTS_FETCH_FAILED, { groupId, error });
    return { listName: DEFAULT_LIST_NAME, lists: [] };
  }
}

export default async function GroupListDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; listId: string }>;
}) {
  const { groupId, listId } = await params;
  const { listName, lists } = await resolveGroupLists(groupId, listId);

  return (
    <main>
      <Navigation />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Typography variant="h4" component="h1">
            {listName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            リストID: {listId}
          </Typography>
          <Button
            component="a"
            href={`/groups/${groupId}/lists/${listId}`}
            type="button"
            variant="outlined"
            sx={{ alignSelf: 'flex-start' }}
          >
            更新
          </Button>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
            <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
              <ListSidebar
                heading="共有リスト"
                createButtonLabel="共有リストを作成"
                selectedListId={listId}
                lists={lists}
                hrefPrefix={`/groups/${groupId}/lists`}
              />
            </Box>
            <Box sx={{ flexGrow: 1, width: '100%' }}>
              <TodoList scope="group" listId={listId} groupId={groupId} apiEnabled />
            </Box>
          </Stack>
        </Stack>
      </Container>
    </main>
  );
}
