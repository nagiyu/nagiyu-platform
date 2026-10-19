'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import Button from '../Button';
import type { ButtonColor } from '../Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** 本文の説明文。省略した場合は children のみを表示する。 */
  description?: string;
  /** description の下に表示する任意の本文 (対象の詳細、注意書き、同意チェックなど)。 */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 確定ボタンの色。既定: `danger` */
  confirmColor?: ButtonColor;
  /** 確定ボタンだけを無効化する (同意チェック待ちなど)。 */
  confirmDisabled?: boolean;
  /** 確定ボタンの `data-testid`。 */
  confirmTestId?: string;
  /** 処理中。ボタンの無効化に加え、背景クリック・Escape での閉じる操作も抑止する。 */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 確認ダイアログ。
 *
 * 幅を揃えるため `maxWidth="sm" fullWidth` に固定している。
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = '削除',
  cancelLabel = 'キャンセル',
  confirmColor = 'danger',
  confirmDisabled = false,
  confirmTestId,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();

  // 処理中に閉じると進行中の処理と画面状態が食い違うため、閉じる操作を無視する。
  const handleClose = () => {
    if (loading) return;
    onCancel();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        {description !== undefined && (
          <DialogContentText sx={children ? { mb: 2 } : undefined}>{description}</DialogContentText>
        )}
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} variant="ghost" disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          color={confirmColor}
          variant="solid"
          loading={loading}
          disabled={confirmDisabled}
          data-testid={confirmTestId}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
