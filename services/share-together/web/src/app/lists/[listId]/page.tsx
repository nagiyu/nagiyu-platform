import { Box, Typography } from '@mui/material';
import { Navigation } from '@/components/Navigation';
import { ListWorkspace } from '@/components/ListWorkspace';

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
        <ListWorkspace initialListId={listId} />
      </Box>
    </main>
  );
}
