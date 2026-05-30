'use client';

import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import type { MemoryListItem } from '@/lib/memory/types';
import MemoryItem from './MemoryItem';

export interface MemoryListProps {
  memories: MemoryListItem[];
  loading: boolean;
  onEdit: (memory: MemoryListItem) => void;
  onDelete: (memory: MemoryListItem) => void;
  onPin?: (memory: MemoryListItem) => void;
}

/**
 * 記憶アイテムの一覧表示。ローディング・空状態を内包する。
 */
export default function MemoryList({
  memories,
  loading,
  onEdit,
  onDelete,
  onPin,
}: MemoryListProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }} data-testid="memory-loading">
        <CircularProgress />
      </Box>
    );
  }

  if (memories.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }} data-testid="memory-empty">
        <Typography variant="body2">まだここに覚えていることはないみたい。</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1.5} data-testid="memory-list">
      {memories.map((memory) => (
        <MemoryItem
          key={memory.id}
          memory={memory}
          onEdit={onEdit}
          onDelete={onDelete}
          onPin={onPin}
        />
      ))}
    </Stack>
  );
}
