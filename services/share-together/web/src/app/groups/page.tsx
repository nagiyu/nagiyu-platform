'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Snackbar, Stack, Typography } from '@mui/material';
import { Navigation } from '@/components/Navigation';
import { GroupCard } from '@/components/GroupCard';
import { CreateItemDialog } from '@/components/CreateItemDialog';

type GroupSummary = {
  groupId: string;
  name: string;
  ownerUserId: string;
};

export default function GroupsPage() {
  const [groups, setGroups] = useState<Array<GroupSummary & { memberCount: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const groupsResponse = await fetch('/api/groups');
        if (!groupsResponse.ok) {
          throw new Error(`status: ${groupsResponse.status}`);
        }

        const groupsData = (await groupsResponse.json()) as { data: { groups: GroupSummary[] } };
        const groupsWithMemberCount = await Promise.all(
          groupsData.data.groups.map(async (group) => {
            try {
              const membersResponse = await fetch(`/api/groups/${group.groupId}/members`);
              if (!membersResponse.ok) {
                return { ...group, memberCount: 0 };
              }

              const membersData = (await membersResponse.json()) as {
                data: { members: Array<{ userId: string }> };
              };
              return { ...group, memberCount: membersData.data.members.length };
            } catch {
              return { ...group, memberCount: 0 };
            }
          })
        );

        setGroups(groupsWithMemberCount);
      } catch (error: unknown) {
        console.error('グループ一覧の取得に失敗しました', { error });
        setSnackbarMessage('グループ一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleCreateGroup = (name: string) => {
    void (async () => {
      try {
        const response = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }

        const data = (await response.json()) as { data: GroupSummary };
        setGroups((prev) => [...prev, { ...data.data, memberCount: 1 }]);
        setSnackbarMessage(`グループ「${name}」を作成しました。`);
      } catch (error: unknown) {
        console.error('グループの作成に失敗しました', { error });
        setSnackbarMessage('グループの作成に失敗しました。');
      }
    })();
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
        {isLoading ? (
          <Typography color="text.secondary">読み込み中...</Typography>
        ) : (
          <Stack spacing={2}>
            {groups.map((group) => (
              <GroupCard
                key={group.groupId}
                name={group.name}
                memberCount={group.memberCount}
                href={`/groups/${group.groupId}`}
              />
            ))}
          </Stack>
        )}
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
