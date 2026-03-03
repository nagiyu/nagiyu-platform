import { Box, Typography } from '@mui/material';
import { headers } from 'next/headers';
import { Navigation } from '@/components/Navigation';
import { ListWorkspace } from '@/components/ListWorkspace';
import type { PersonalListResponse } from '@/types';

const ERROR_MESSAGES = {
  PERSONAL_LIST_FETCH_FAILED: '個人リスト詳細の取得に失敗しました',
} as const;

async function resolveListName(listId: string): Promise<string> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
    if (!host) {
      return '個人リスト';
    }

    const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
    const response = await fetch(`${protocol}://${host}/api/lists/${listId}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`status: ${response.status}`);
    }

    const result = (await response.json()) as PersonalListResponse;
    return result.data.name;
  } catch (error: unknown) {
    console.error(ERROR_MESSAGES.PERSONAL_LIST_FETCH_FAILED, { listId, error });
    return '個人リスト';
  }
}

export default async function PersonalListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const listName = await resolveListName(listId);

  return (
    <main>
      <Navigation />
      <Box component="section" sx={{ p: 2, maxWidth: 1080, mx: 'auto' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          {listName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          リストID: {listId}
        </Typography>
        <ListWorkspace initialListId={listId} />
      </Box>
    </main>
  );
}
