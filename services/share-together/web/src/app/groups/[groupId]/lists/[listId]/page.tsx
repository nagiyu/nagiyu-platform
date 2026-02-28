import { Navigation } from '@/components/Navigation';
import { TodoList } from '@/components/TodoList';
import { ListSidebar } from '@/components/ListSidebar';
import { MockActionButton } from '@/components/MockActionButton';
import { Box, Container, Stack, Typography } from '@mui/material';

const MOCK_GROUP_LISTS = [
  { listId: 'mock-list-1', name: '買い物リスト（共有）' },
  { listId: 'mock-list-2', name: '旅行準備リスト' },
] as const;

export default async function GroupListDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; listId: string }>;
}) {
  const { groupId, listId } = await params;

  return (
    <main>
      <Navigation />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Typography variant="h4" component="h1">
            グループ共有リスト詳細（モック）
          </Typography>
          <Typography variant="body2" color="text.secondary">
            グループID: {groupId}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            リストID: {listId}
          </Typography>
          <MockActionButton
            label="更新（モック）"
            successLabel="更新済み"
            feedback="リストを再取得しました（モック）"
            buttonProps={{ type: 'button', variant: 'outlined', sx: { alignSelf: 'flex-start' } }}
          />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
            <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
              <ListSidebar
                heading="共有リスト"
                createButtonLabel="共有リストを作成"
                selectedListId={listId}
                lists={MOCK_GROUP_LISTS}
                hrefPrefix={`/groups/${groupId}/lists`}
              />
            </Box>
            <Box sx={{ flexGrow: 1, width: '100%' }}>
              <TodoList scope="group" listId={listId} />
            </Box>
          </Stack>
        </Stack>
      </Container>
    </main>
  );
}
