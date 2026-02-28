'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { InviteForm } from '@/components/InviteForm';

type Member = {
  userId: string;
  name: string;
};

type GroupDetailClientProps = {
  groupId: string;
  isOwner: boolean;
  currentUserId: string;
  members: readonly Member[];
};

export function GroupDetailClient({
  groupId,
  isOwner,
  currentUserId,
  members: initialMembers,
}: GroupDetailClientProps) {
  const [members, setMembers] = useState<Member[]>([...initialMembers]);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'deleteMember' | 'leaveGroup' | 'deleteGroup';
    targetId?: string;
    targetName?: string;
  }>({ open: false, type: 'deleteMember' });
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const handleDeleteMemberRequest = (userId: string, name: string) => {
    setConfirmDialog({ open: true, type: 'deleteMember', targetId: userId, targetName: name });
  };

  const handleLeaveGroupRequest = () => {
    setConfirmDialog({ open: true, type: 'leaveGroup' });
  };

  const handleDeleteGroupRequest = () => {
    setConfirmDialog({ open: true, type: 'deleteGroup' });
  };

  const handleConfirm = () => {
    const { type, targetId, targetName } = confirmDialog;
    if (type === 'deleteMember' && targetId) {
      setMembers((prev) => prev.filter((m) => m.userId !== targetId));
      setSnackbarMessage(`${targetName}さんをグループから削除しました（モック）。`);
    } else if (type === 'leaveGroup') {
      setLeft(true);
      setSnackbarMessage('グループから脱退しました（モック）。');
    } else if (type === 'deleteGroup') {
      setDeleted(true);
      setSnackbarMessage('グループを削除しました（モック）。');
    }
    setConfirmDialog({ open: false, type: 'deleteMember' });
  };

  const handleCancel = () => {
    setConfirmDialog({ open: false, type: 'deleteMember' });
  };

  const getConfirmDialogProps = () => {
    const { type, targetName } = confirmDialog;
    if (type === 'deleteMember') {
      return {
        title: 'メンバーを削除',
        description: `${targetName}さんをグループから削除しますか？`,
        confirmLabel: '削除',
      };
    }
    if (type === 'leaveGroup') {
      return {
        title: 'グループを脱退',
        description: 'このグループから脱退しますか？',
        confirmLabel: '脱退',
      };
    }
    return {
      title: 'グループを削除',
      description: 'このグループを削除しますか？この操作は元に戻せません。',
      confirmLabel: '削除',
    };
  };

  if (deleted) {
    return (
      <Alert severity="success" sx={{ mt: 2 }}>
        グループを削除しました（モック）。
      </Alert>
    );
  }

  if (left) {
    return (
      <Alert severity="success" sx={{ mt: 2 }}>
        グループから脱退しました（モック）。
      </Alert>
    );
  }

  const confirmProps = getConfirmDialogProps();

  return (
    <>
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
              {members.map((member) => (
                <ListItem
                  key={member.userId}
                  disablePadding
                  secondaryAction={
                    isOwner && member.userId !== currentUserId ? (
                      <IconButton
                        edge="end"
                        color="error"
                        aria-label={`${member.name}を削除`}
                        onClick={() => handleDeleteMemberRequest(member.userId, member.name)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    ) : undefined
                  }
                >
                  <ListItemText primary={member.name} />
                </ListItem>
              ))}
            </List>
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              {isOwner ? (
                <Button variant="outlined" color="error" onClick={handleDeleteGroupRequest}>
                  グループを削除
                </Button>
              ) : (
                <Button variant="outlined" color="warning" onClick={handleLeaveGroupRequest}>
                  グループを脱退
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              メンバー招待フォーム
            </Typography>
            <InviteForm isOwner={isOwner} />
          </CardContent>
        </Card>
      </Stack>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmProps.title}
        description={confirmProps.description}
        confirmLabel={confirmProps.confirmLabel}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </>
  );
}
