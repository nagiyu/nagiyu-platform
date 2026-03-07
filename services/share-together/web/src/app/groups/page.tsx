'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Snackbar, Stack, Typography } from '@mui/material';
import { Navigation } from '@/components/Navigation';
import { GroupCard } from '@/components/GroupCard';
import { CreateItemDialog } from '@/components/CreateItemDialog';
import { GroupDetailClient } from '@/components/GroupDetailClient';

type GroupSummary = {
  groupId: string;
  name: string;
  ownerUserId: string;
  isOwner?: boolean;
};

export default function GroupsPage() {
  const [groups, setGroups] = useState<Array<GroupSummary & { memberCount: number }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [members, setMembers] = useState<Array<{ userId: string; name: string }>>([]);
  const [groupLists, setGroupLists] = useState<Array<{ listId: string; name: string }>>([]);
  const [isSelectedGroupLoading, setIsSelectedGroupLoading] = useState(false);
  const [selectedGroupError, setSelectedGroupError] = useState<string | null>(null);
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
        if (groupsWithMemberCount.length > 0) {
          setSelectedGroupId(groupsWithMemberCount[0].groupId);
        }
      } catch (error: unknown) {
        console.error('グループ一覧の取得に失敗しました', { error });
        setSnackbarMessage('グループ一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedGroupId) {
      return;
    }

    setIsSelectedGroupLoading(true);
    setSelectedGroupError(null);

    void (async () => {
      try {
        const [groupsResponse, membersResponse, sessionResponse, listsResponse] = await Promise.all([
          fetch('/api/groups'),
          fetch(`/api/groups/${selectedGroupId}/members`),
          fetch('/api/auth/session'),
          fetch(`/api/groups/${selectedGroupId}/lists`),
        ]);

        if (!groupsResponse.ok || !membersResponse.ok || !sessionResponse.ok || !listsResponse.ok) {
          throw new Error(
            `status: ${groupsResponse.status},${membersResponse.status},${sessionResponse.status},${listsResponse.status}`
          );
        }

        const groupsData = (await groupsResponse.json()) as { data: { groups: GroupSummary[] } };
        const membersData = (await membersResponse.json()) as {
          data: { members: Array<{ userId: string; name: string }> };
        };
        const listsData = (await listsResponse.json()) as {
          data: { lists: Array<{ listId: string; name: string }> };
        };
        const sessionData = (await sessionResponse.json()) as { user?: { id?: unknown } };
        if (typeof sessionData.user?.id !== 'string' || sessionData.user.id.length === 0) {
          setSelectedGroupError('ユーザーIDが取得できませんでした。再度ログインしてください。');
          return;
        }
        const targetGroup = groupsData.data.groups.find((group) => group.groupId === selectedGroupId);
        if (!targetGroup) {
          setSelectedGroupError('対象のグループが見つかりません。');
          return;
        }

        setCurrentUserId(sessionData.user.id);
        setMembers(membersData.data.members);
        setGroupLists(listsData.data.lists);
      } catch (error: unknown) {
        console.error('グループ詳細の取得に失敗しました', { selectedGroupId, error });
        setSelectedGroupError('グループ詳細の取得に失敗しました。');
      } finally {
        setIsSelectedGroupLoading(false);
      }
    })();
  }, [selectedGroupId]);

  const selectedGroup = groups.find((group) => group.groupId === selectedGroupId);

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
        setGroups((prev) => {
          const next = [...prev, { ...data.data, memberCount: 1 }];
          if (!selectedGroupId) {
            setSelectedGroupId(data.data.groupId);
          }
          return next;
        });
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
            グループ
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
                onClick={() => setSelectedGroupId(group.groupId)}
              />
            ))}
          </Stack>
        )}
        {selectedGroupId ? (
          <Box sx={{ mt: 3 }}>
            {isSelectedGroupLoading ? (
              <Typography color="text.secondary">グループ詳細を読み込み中...</Typography>
            ) : selectedGroupError ? (
              <Typography color="error">{selectedGroupError}</Typography>
            ) : selectedGroup ? (
              <GroupDetailClient
                groupId={selectedGroupId}
                isOwner={selectedGroup.isOwner ?? selectedGroup.ownerUserId === currentUserId}
                currentUserId={currentUserId}
                members={members}
                groupLists={groupLists}
              />
            ) : null}
          </Box>
        ) : null}
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
