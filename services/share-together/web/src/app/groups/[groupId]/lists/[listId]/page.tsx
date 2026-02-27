import { Navigation } from '@/components/Navigation';
import { TodoList } from '@/components/TodoList';
import { Button, Container, Stack, Typography } from '@mui/material';

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
          <Button type="button" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
            更新（モック）
          </Button>
          <TodoList />
        </Stack>
      </Container>
    </main>
  );
}
