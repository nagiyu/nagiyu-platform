import { Navigation } from '@/components/Navigation';
import { MockActionButton } from '@/components/MockActionButton';
import {
  Box,
  Card,
  CardActions,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from '@mui/material';

const MOCK_INVITATIONS = [
  {
    groupId: 'mock-group-1',
    groupName: '週末の買い出し',
    inviterName: '田中さん',
    invitedAt: '2026-02-20 19:30',
  },
  {
    groupId: 'mock-group-2',
    groupName: '旅行準備リスト',
    inviterName: '佐藤さん',
    invitedAt: '2026-02-21 08:15',
  },
] as const;

export default function InvitationsPage() {
  return (
    <main>
      <Navigation />
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Typography component="h1" variant="h4" gutterBottom>
          招待一覧
        </Typography>
        <Stack spacing={2}>
          {MOCK_INVITATIONS.map((invitation) => (
            <Card key={invitation.groupId}>
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 1 }}
                >
                  <Typography component="h2" variant="h6">
                    {invitation.groupName}
                  </Typography>
                  <Chip label="招待中" color="info" size="small" />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  招待者: {invitation.inviterName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  招待日時: {invitation.invitedAt}
                </Typography>
              </CardContent>
              <CardActions sx={{ px: 2, pb: 2 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <MockActionButton
                    label="承認"
                    successLabel="承認済み"
                    feedback="参加ステータスを承認に更新しました（モック）"
                    buttonProps={{ variant: 'contained', color: 'primary' }}
                  />
                  <MockActionButton
                    label="拒否"
                    successLabel="拒否済み"
                    feedback="参加ステータスを拒否に更新しました（モック）"
                    buttonProps={{ variant: 'outlined', color: 'inherit' }}
                  />
                </Box>
              </CardActions>
            </Card>
          ))}
        </Stack>
      </Container>
    </main>
  );
}
