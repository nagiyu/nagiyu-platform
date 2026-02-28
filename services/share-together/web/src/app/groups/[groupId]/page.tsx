import { Navigation } from '@/components/Navigation';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  List,
  ListItem,
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

const CURRENT_USER_ID = 'user-owner';

const GROUP_OWNERS: Record<string, string> = {
  'mock-family-group': 'user-owner',
  'mock-roommate-group': 'user-member-1',
  'mock-project-group': 'user-owner',
};

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const isOwner = GROUP_OWNERS[groupId] === CURRENT_USER_ID;

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
                メンバー招待フォーム
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {isOwner
                  ? 'オーナーとしてメンバーを招待できます。'
                  : 'このグループではメンバー追加はできません（オーナーのみ）。'}
              </Typography>
              <Box component="form">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    id="invite-email"
                    fullWidth
                    type="email"
                    label="メールアドレス"
                    placeholder="example@nagiyu.com"
                    disabled={!isOwner}
                  />
                  <Button type="button" variant="contained" disabled={!isOwner}>
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
