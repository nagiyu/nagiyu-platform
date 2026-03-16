'use client';

import { useEffect, useState } from 'react';
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
import type { InvitationSummary, InvitationsResponse } from '@/types';

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<{ groupId: string; groupName: string } | null>(
    null
  );
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/invitations');
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }

        const data = (await response.json()) as InvitationsResponse;
        setInvitations(data.data.invitations);
      } catch (error: unknown) {
        console.error('招待一覧の取得に失敗しました', { error });
        setSnackbarMessage('招待一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleAccept = (groupId: string, groupName: string) => {
    void (async () => {
      try {
        const response = await fetch(`/api/invitations/${groupId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ACCEPT' }),
        });
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }

        setInvitations((prev) => prev.filter((inv) => inv.groupId !== groupId));
        setSnackbarMessage(`「${groupName}」への参加を承認しました。`);
      } catch (error: unknown) {
        console.error('招待の承認に失敗しました', { groupId, error });
        setSnackbarMessage('招待の承認に失敗しました。');
      }
    })();
  };

  const handleRejectRequest = (groupId: string, groupName: string) => {
    setRejectTarget({ groupId, groupName });
  };

  const handleRejectConfirm = () => {
    if (!rejectTarget) return;

    void (async () => {
      try {
        const response = await fetch(`/api/invitations/${rejectTarget.groupId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'REJECT' }),
        });
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }

        setInvitations((prev) => prev.filter((inv) => inv.groupId !== rejectTarget.groupId));
        setSnackbarMessage(`「${rejectTarget.groupName}」への招待を拒否しました。`);
      } catch (error: unknown) {
        console.error('招待の拒否に失敗しました', { groupId: rejectTarget.groupId, error });
        setSnackbarMessage('招待の拒否に失敗しました。');
      } finally {
        setRejectTarget(null);
      }
    })();
  };

  const handleRejectCancel = () => {
    setRejectTarget(null);
  };

  return (
    <main>
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Typography component="h1" variant="h4" gutterBottom>
          招待一覧
        </Typography>
        {isLoading ? (
          <Typography color="text.secondary">読み込み中...</Typography>
        ) : invitations.length === 0 ? (
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
                    招待日時: {invitation.createdAt}
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
