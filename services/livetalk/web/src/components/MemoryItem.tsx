'use client';

import { Card, CardContent, IconButton, Stack, Typography } from '@mui/material';
import type { SelfFactListItem } from '@/lib/memory/types';

export interface MemoryItemProps {
  item: SelfFactListItem;
  onDelete: (item: SelfFactListItem) => void;
}

/**
 * SELF fact 1 件の表示カード（リブトーク知識再設計 P2 / #3698）。
 * text 本文と削除ボタンのみを持つ。Tier・confidence・pin は撤去。
 * モバイルでもタップしやすい余白を確保する。
 */
export default function MemoryItem({ item, onDelete }: MemoryItemProps) {
  return (
    <Card variant="outlined" data-testid="memory-item">
      <CardContent sx={{ pb: 1.5 }}>
        <Typography variant="body1" sx={{ mb: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {item.text}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <IconButton
            size="small"
            aria-label="削除"
            data-testid="memory-delete"
            onClick={() => onDelete(item)}
          >
            🗑️
          </IconButton>
        </Stack>
      </CardContent>
    </Card>
  );
}
