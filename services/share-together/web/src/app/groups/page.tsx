'use client';

import { useState } from 'react';
import { Box, Button, Snackbar, Stack, Typography } from '@mui/material';
import { Navigation } from '@/components/Navigation';
import { GroupCard } from '@/components/GroupCard';
import { CreateItemDialog } from '@/components/CreateItemDialog';

const MOCK_GROUPS = [
  { groupId: 'mock-family-group', name: '家族', memberCount: 3 },
  { groupId: 'mock-roommate-group', name: 'ルームメイト', memberCount: 2 },
  { groupId: 'mock-project-group', name: 'プロジェクトA', memberCount: 4 },
] as const;

export default function GroupsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const handleCreateGroup = (name: string) => {
    setSnackbarMessage(`グループ「${name}」を作成しました（モック）。`);
  };

  return (
    <main>
      <Navigation />
      <Box component="section" sx={{ p: 2, maxWidth: 720, mx: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h5" component="h1">
            グループ一覧
          </Typography>
          <Button variant="contained" onClick={() => setCreateDialogOpen(true)}>
            グループを作成
          </Button>
        </Stack>
        <Stack spacing={2}>
          {MOCK_GROUPS.map((group) => (
            <GroupCard
              key={group.groupId}
              name={group.name}
              memberCount={group.memberCount}
              href={`/groups/${group.groupId}`}
            />
          ))}
        </Stack>
      </Box>
      <CreateItemDialog
        open={createDialogOpen}
        title="グループを作成"
        label="グループ名"
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateGroup}
      />
      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </main>
  );
}
