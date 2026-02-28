'use client';

import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Container,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';

const MOCK_INVITATIONS_DATA = [
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
  const [invitations, setInvitations] = useState([...MOCK_INVITATIONS_DATA]);
  const [rejectTarget, setRejectTarget] = useState<{ groupId: string; groupName: string } | null>(
    null
  );
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const handleAccept = (groupId: string, groupName: string) => {
    setInvitations((prev) => prev.filter((inv) => inv.groupId !== groupId));
    setSnackbarMessage(`「${groupName}」への参加を承認しました（モック）。`);
  };

  const handleRejectRequest = (groupId: string, groupName: string) => {
    setRejectTarget({ groupId, groupName });
  };

  const handleRejectConfirm = () => {
    if (rejectTarget) {
      setInvitations((prev) => prev.filter((inv) => inv.groupId !== rejectTarget.groupId));
      setSnackbarMessage(`「${rejectTarget.groupName}」への招待を拒否しました（モック）。`);
      setRejectTarget(null);
    }
  };

  const handleRejectCancel = () => {
    setRejectTarget(null);
  };

  return (
    <main>
      <Navigation />
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Typography component="h1" variant="h4" gutterBottom>
          招待一覧
        </Typography>
        {invitations.length === 0 ? (
          <Typography color="text.secondary">招待はありません。</Typography>
        ) : (
          <Stack spacing={2}>
            {invitations.map((invitation) => (
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
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => handleAccept(invitation.groupId, invitation.groupName)}
                    >
                      承認
                    </Button>
                    <Button
                      variant="outlined"
                      color="inherit"
                      onClick={() => handleRejectRequest(invitation.groupId, invitation.groupName)}
                    >
                      拒否
                    </Button>
                  </Box>
                </CardActions>
              </Card>
            ))}
          </Stack>
        )}
      </Container>
      <ConfirmDialog
        open={rejectTarget !== null}
        title="招待を拒否"
        description={`「${rejectTarget?.groupName ?? ''}」への招待を拒否しますか？`}
        confirmLabel="拒否"
        onConfirm={handleRejectConfirm}
        onCancel={handleRejectCancel}
      />
      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </main>
  );
}
