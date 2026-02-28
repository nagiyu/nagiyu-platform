import { Navigation } from '@/components/Navigation';
import { GroupDetailClient } from '@/components/GroupDetailClient';
import { Container, Typography } from '@mui/material';

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
        <GroupDetailClient
          groupId={groupId}
          isOwner={isOwner}
          currentUserId={CURRENT_USER_ID}
          members={MOCK_MEMBERS}
        />
      </Container>
    </main>
  );
}
