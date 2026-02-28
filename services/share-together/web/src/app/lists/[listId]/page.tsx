import { Box, Stack, Typography } from '@mui/material';
import { Navigation } from '@/components/Navigation';
import { ListSidebar, MOCK_PERSONAL_LISTS } from '@/components/ListSidebar';
import { TodoList } from '@/components/TodoList';

const MOCK_LIST_NAMES: Record<string, string> = {
  'mock-default-list': 'デフォルトリスト',
  'mock-work-list': '仕事',
  'mock-shopping-list': '買い物',
};

export default async function PersonalListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const listName = MOCK_LIST_NAMES[listId] ?? '個人リスト';

  return (
    <main>
      <Navigation />
      <Box component="section" sx={{ p: 2, maxWidth: 1080, mx: 'auto' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          {listName}（モック）
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          リストID: {listId}
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
          <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
            <ListSidebar
              heading="個人リスト"
              createButtonLabel="個人リストを作成"
              selectedListId={listId}
              lists={MOCK_PERSONAL_LISTS}
              hrefPrefix="/lists"
            />
          </Box>
          <Box sx={{ flexGrow: 1, width: '100%' }}>
            <TodoList listId={listId} />
          </Box>
        </Stack>
      </Box>
    </main>
  );
}
