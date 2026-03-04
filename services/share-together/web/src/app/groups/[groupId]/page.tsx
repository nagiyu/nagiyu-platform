'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { GroupDetailClient } from '@/components/GroupDetailClient';
import { Container, Typography } from '@mui/material';

type GroupSummary = {
  groupId: string;
  ownerUserId: string;
  isOwner: boolean;
};

type GroupMember = {
  userId: string;
  name: string;
};

type GroupList = {
  listId: string;
  name: string;
};

export default function GroupDetailPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [groupLists, setGroupLists] = useState<GroupList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) {
      return;
    }

    void (async () => {
      try {
        const [groupsResponse, membersResponse, sessionResponse, listsResponse] = await Promise.all(
          [
            fetch('/api/groups'),
            fetch(`/api/groups/${groupId}/members`),
            fetch('/api/auth/session'),
            fetch(`/api/groups/${groupId}/lists`),
          ]
        );

        if (!groupsResponse.ok || !membersResponse.ok || !sessionResponse.ok || !listsResponse.ok) {
          throw new Error(
            `status: ${groupsResponse.status},${membersResponse.status},${sessionResponse.status},${listsResponse.status}`
          );
        }

        const groupsData = (await groupsResponse.json()) as { data: { groups: GroupSummary[] } };
        const membersData = (await membersResponse.json()) as { data: { members: GroupMember[] } };
        const listsData = (await listsResponse.json()) as { data: { lists: GroupList[] } };
        const sessionData = (await sessionResponse.json()) as { user?: { id?: unknown } };
        if (typeof sessionData.user?.id !== 'string' || sessionData.user.id.length === 0) {
          setErrorMessage('ユーザーIDが取得できませんでした。再度ログインしてください。');
          return;
        }
        const targetGroup = groupsData.data.groups.find((group) => group.groupId === groupId);

        if (!targetGroup) {
          setErrorMessage('対象のグループが見つかりません。');
          return;
        }

        setIsOwner(targetGroup.isOwner);
        setCurrentUserId(sessionData.user.id);
        setMembers(membersData.data.members);
        setGroupLists(listsData.data.lists);
      } catch (error: unknown) {
        console.error('グループ詳細の取得に失敗しました', { groupId, error });
        setErrorMessage('グループ詳細の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [groupId]);

  return (
    <main>
      <Navigation />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          グループ詳細
        </Typography>
        {isLoading ? (
          <Typography color="text.secondary">読み込み中...</Typography>
        ) : errorMessage ? (
          <Typography color="error">{errorMessage}</Typography>
        ) : (
          <GroupDetailClient
            groupId={groupId}
            isOwner={isOwner}
            currentUserId={currentUserId}
            members={members}
            groupLists={groupLists}
          />
        )}
      </Container>
    </main>
  );
}
