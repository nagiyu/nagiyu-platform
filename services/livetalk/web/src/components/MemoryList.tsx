'use client';

import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import type { SelfFactListItem } from '@/lib/memory/types';
import MemoryItem from './MemoryItem';

export interface MemoryListProps {
  items: SelfFactListItem[];
  loading: boolean;
  onDelete: (item: SelfFactListItem) => void;
}

interface TopicGroup {
  topicId: string;
  subject: string;
  items: SelfFactListItem[];
}

/**
 * Topic（subject）ごとにグルーピングする。表示順は各グループの先頭アイテムの
 * 出現順（呼び出し側で createdAt 降順ソート済みの前提）を維持する。
 */
function groupBySubject(items: SelfFactListItem[]): TopicGroup[] {
  const groups: TopicGroup[] = [];
  const indexByTopicId = new Map<string, number>();

  for (const item of items) {
    const existingIndex = indexByTopicId.get(item.topicId);
    if (existingIndex === undefined) {
      indexByTopicId.set(item.topicId, groups.length);
      groups.push({ topicId: item.topicId, subject: item.subject, items: [item] });
    } else {
      groups[existingIndex].items.push(item);
    }
  }

  return groups;
}

/**
 * SELF fact 一覧表示（リブトーク知識再設計 P2 / #3698）。
 * Topic（subject）ごとにグルーピングして表示する。ローディング・空状態を内包する。
 */
export default function MemoryList({ items, loading, onDelete }: MemoryListProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }} data-testid="memory-loading">
        <CircularProgress />
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }} data-testid="memory-empty">
        <Typography variant="body2">まだここに覚えていることはないみたい。</Typography>
      </Box>
    );
  }

  const groups = groupBySubject(items);

  return (
    <Stack spacing={3} data-testid="memory-list">
      {groups.map((group) => (
        <Box key={group.topicId} data-testid="memory-topic-group">
          <Typography
            variant="subtitle2"
            sx={{ mb: 1, color: 'text.secondary' }}
            data-testid="memory-topic-subject"
          >
            {group.subject}
          </Typography>
          <Stack spacing={1.5}>
            {group.items.map((item) => (
              <MemoryItem key={item.id} item={item} onDelete={onDelete} />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
