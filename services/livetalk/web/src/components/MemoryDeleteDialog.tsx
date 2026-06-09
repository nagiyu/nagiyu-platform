'use client';

import {
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { Button } from '@nagiyu/ui';
import type { MemoryListItem } from '@/lib/memory/types';
import { getMemoryDeleteAnnotation } from '@/lib/memory/messages';

export interface MemoryDeleteDialogProps {
  memory: MemoryListItem | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 選択中のキャラクター ID。省略時は既定キャラクターを使用する。 */
  characterId?: string;
}

/**
 * 記憶削除の確認ダイアログ。
 *
 * MemoryEntity を削除しても三層（MemoryEntity / MemorySummary / Messages）のうち
 * 残り2層には即時反映されないため、注釈（Alert warning）で明示する（Issue #3308）。
 */
export default function MemoryDeleteDialog({
  memory,
  loading = false,
  onConfirm,
  onCancel,
  characterId,
}: MemoryDeleteDialogProps) {
  return (
    <Dialog open={memory !== null} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>この記憶を削除しますか？</DialogTitle>
      <DialogContent>
        {memory && (
          <DialogContentText sx={{ mb: 1.5 }}>
            {`「${memory.content}」を忘れます。元には戻せません。`}
          </DialogContentText>
        )}
        <Alert severity="warning" data-testid="delete-annotation">
          {getMemoryDeleteAnnotation(characterId)}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button variant="ghost" color="neutral" onClick={onCancel} disabled={loading}>
          やめる
        </Button>
        <Button
          variant="solid"
          color="danger"
          onClick={onConfirm}
          loading={loading}
          disabled={loading}
          data-testid="memory-delete-confirm"
        >
          削除
        </Button>
      </DialogActions>
    </Dialog>
  );
}
