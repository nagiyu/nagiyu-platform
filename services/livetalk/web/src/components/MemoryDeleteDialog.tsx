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
import type { SelfFactListItem } from '@/lib/memory/types';
import { getMemoryDeleteAnnotation } from '@/lib/memory/messages';

export interface MemoryDeleteDialogProps {
  item: SelfFactListItem | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 選択中のキャラクター ID。省略時は既定キャラクターを使用する。 */
  characterId?: string;
}

/**
 * 記憶削除の確認ダイアログ（リブトーク知識再設計 P2 / #3698）。
 *
 * 削除は決定的（deleteSelfFact → canonicalSummary 再生成）であり、以降の会話には
 * 出てこなくなる旨・元に戻せない旨を注釈（Alert warning）で明示する。
 */
export default function MemoryDeleteDialog({
  item,
  loading = false,
  onConfirm,
  onCancel,
  characterId,
}: MemoryDeleteDialogProps) {
  return (
    <Dialog open={item !== null} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>この記憶を削除しますか？</DialogTitle>
      <DialogContent>
        {item && (
          <DialogContentText sx={{ mb: 1.5 }}>
            {`「${item.text}」を忘れます。元には戻せません。`}
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
