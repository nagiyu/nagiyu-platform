'use client';

import { Box, Card, CardContent, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import type { MemoryListItem } from '@/lib/memory/types';
import { confidenceToStars, formatLastReferenced } from '@/lib/memory/format';

export interface MemoryItemProps {
  memory: MemoryListItem;
  onEdit: (memory: MemoryListItem) => void;
  onDelete: (memory: MemoryListItem) => void;
  onPin?: (memory: MemoryListItem) => void;
}

/**
 * 記憶 1 件の表示カード。content・category・信頼度（星）・最終言及日と
 * 編集 / 削除 / 固定ボタンを持つ。モバイルでもタップしやすい余白を確保する。
 */
export default function MemoryItem({ memory, onEdit, onDelete, onPin }: MemoryItemProps) {
  const stars = confidenceToStars(memory.confidence);

  return (
    <Card variant="outlined" data-testid="memory-item">
      <CardContent sx={{ pb: 1.5 }}>
        <Typography variant="body1" sx={{ mb: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {memory.content}
        </Typography>

        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: 'center',
            color: 'text.secondary',
            fontSize: '0.8rem',
            mb: 1,
            flexWrap: 'wrap',
          }}
        >
          <Box component="span" data-testid="memory-category">
            #{memory.category}
          </Box>
          <Tooltip title={`信頼度 ${Math.round(memory.confidence * 100)}%`} arrow>
            <Box
              component="span"
              aria-label={`信頼度 ${stars} / 5`}
              data-testid="memory-confidence"
            >
              {'★'.repeat(stars)}
              {'☆'.repeat(5 - stars)}
            </Box>
          </Tooltip>
          <Box component="span">最終: {formatLastReferenced(memory.lastReferencedAt)}</Box>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          {onPin && memory.tier !== 'A' && (
            <Tooltip title="この記憶を「確定」に固定する" arrow>
              <IconButton
                size="small"
                aria-label="固定"
                data-testid="memory-pin"
                onClick={() => onPin(memory)}
              >
                📌
              </IconButton>
            </Tooltip>
          )}
          <IconButton
            size="small"
            aria-label="編集"
            data-testid="memory-edit"
            onClick={() => onEdit(memory)}
          >
            ✏️
          </IconButton>
          <IconButton
            size="small"
            aria-label="削除"
            data-testid="memory-delete"
            onClick={() => onDelete(memory)}
          >
            🗑️
          </IconButton>
        </Stack>
      </CardContent>
    </Card>
  );
}
