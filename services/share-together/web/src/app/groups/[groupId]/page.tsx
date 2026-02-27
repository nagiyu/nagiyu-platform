import { Navigation } from '@/components/Navigation';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

const MOCK_MEMBERS = [
  { userId: 'user-owner', name: 'なぎゆ' },
  { userId: 'user-member-1', name: 'さくら' },
  { userId: 'user-member-2', name: 'たろう' },
] as const;

const MOCK_GROUP_LISTS = [
  { listId: 'mock-list-1', name: '買い物リスト（共有）' },
  { listId: 'mock-list-2', name: '旅行準備リスト' },
] as const;

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <main>
      <Navigation />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          グループ詳細（モック）
        </Typography>
        <Typography variant="body2" color="text.secondary">
          グループID: {groupId}
        </Typography>

        <Stack spacing={3} sx={{ mt: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                メンバー一覧
              </Typography>
              <List>
                {MOCK_MEMBERS.map((member) => (
                  <ListItem key={member.userId} disablePadding>
                    <ListItemText primary={member.name} />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                共有リスト一覧
              </Typography>
              <List>
                {MOCK_GROUP_LISTS.map((list) => (
                  <ListItem key={list.listId} disablePadding>
                    <ListItemButton component="a" href={`/groups/${groupId}/lists/${list.listId}`}>
                      <ListItemText primary={list.name} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                メンバー招待フォーム
              </Typography>
              <Box component="form">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField fullWidth label="メールアドレス" placeholder="example@nagiyu.com" />
                  <Button type="submit" variant="contained">
                    招待を送信（モック）
                  </Button>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </main>
  );
}
