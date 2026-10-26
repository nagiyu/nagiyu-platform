'use client';

import { Alert } from '@mui/material';
import { ConfirmDialog } from '@nagiyu/ui';
import type { SelfFactListItem } from '@/lib/memory/types';
import { getMemoryDeleteAnnotation } from '@/lib/memory/messages';

export interface MemoryDeleteDialogProps {
  item: SelfFactListItem | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 削除の失敗メッセージ。ダイアログの裏に隠れないよう、ダイアログ内に表示する。 */
  error?: string | null;
  /** 選択中のキャラクター ID。省略時は既定キャラクターを使用する。 */
  characterId?: string;
}

/**
 * 記憶削除の確認ダイアログ。
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
  error,
}: MemoryDeleteDialogProps) {
  return (
    <ConfirmDialog
      open={item !== null}
      title="この記憶を削除しますか？"
      description={item ? `「${item.text}」を忘れます。元には戻せません。` : undefined}
      confirmTestId="memory-delete-confirm"
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {error && (
        <Alert severity="error" role="alert" data-testid="delete-error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Alert severity="warning" data-testid="delete-annotation">
        {getMemoryDeleteAnnotation(characterId)}
      </Alert>
    </ConfirmDialog>
  );
}
