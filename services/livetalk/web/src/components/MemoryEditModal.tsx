'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { Button, TextField } from '@nagiyu/ui';
import type { MemoryListItem, MemoryPatchInput } from '@/lib/memory/types';
import {
  MEMORY_CATEGORY_MAX_LENGTH,
  MEMORY_CONTENT_MAX_LENGTH,
  validateMemoryPatch,
} from '@/lib/memory/validation';

export interface MemoryEditModalProps {
  open: boolean;
  memory: MemoryListItem | null;
  submitting?: boolean;
  onSave: (id: string, patch: MemoryPatchInput) => void;
  onClose: () => void;
}

const ERROR_MESSAGES = {
  VALIDATION: '入力内容を確認してください（内容は必須、カテゴリに「#」は使えません）。',
} as const;

/**
 * 記憶の content / category を編集するモーダル。ConsentModal と同じ Dialog パターン。
 * 保存前にクライアント側でも `validateMemoryPatch` を通し、API と同じルールで弾く。
 */
export default function MemoryEditModal({
  open,
  memory,
  submitting = false,
  onSave,
  onClose,
}: MemoryEditModalProps) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (memory) {
      setContent(memory.content);
      setCategory(memory.category);
      setError(null);
    }
  }, [memory]);

  const handleSave = () => {
    if (!memory) return;
    const patch: MemoryPatchInput = { content, category };
    const validation = validateMemoryPatch(patch);
    if (!validation.ok) {
      setError(ERROR_MESSAGES.VALIDATION);
      return;
    }
    setError(null);
    onSave(memory.id, validation.value);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>記憶を編集</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="覚えている内容"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            multiline
            fullWidth
            maxLength={MEMORY_CONTENT_MAX_LENGTH}
          />
          <TextField
            label="カテゴリ"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            fullWidth
            maxLength={MEMORY_CATEGORY_MAX_LENGTH}
            helperText="「#」は使えません"
          />
          {error && (
            <Typography color="error" variant="body2" role="alert" data-testid="memory-edit-error">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="ghost" color="neutral" onClick={onClose} disabled={submitting}>
          キャンセル
        </Button>
        <Button
          variant="solid"
          color="primary"
          onClick={handleSave}
          loading={submitting}
          disabled={submitting}
          data-testid="memory-edit-save"
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
