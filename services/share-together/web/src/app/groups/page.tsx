'use client';

import { Box, Button, Stack, Typography } from '@mui/material';
import { Navigation } from '@/components/Navigation';
import { GroupCard } from '@/components/GroupCard';

const MOCK_GROUPS = [
  { groupId: 'mock-family-group', name: '家族', memberCount: 3 },
  { groupId: 'mock-roommate-group', name: 'ルームメイト', memberCount: 2 },
  { groupId: 'mock-project-group', name: 'プロジェクトA', memberCount: 4 },
] as const;

export default function GroupsPage() {
  return (
    <main>
      <Navigation />
      <Box component="section" sx={{ p: 2, maxWidth: 720, mx: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h5" component="h1">
            グループ一覧
          </Typography>
          <Button variant="contained" onClick={() => alert('グループを作成（モック）')}>
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
    </main>
  );
}
