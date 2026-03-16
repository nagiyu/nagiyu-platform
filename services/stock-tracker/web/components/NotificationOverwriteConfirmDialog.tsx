'use client';

import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';

interface NotificationOverwriteConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function NotificationOverwriteConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: NotificationOverwriteConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>通知本文を更新しますか？</DialogTitle>
      <DialogContent>
        <Typography>
          条件または価格が変更されました。現在の通知本文をデフォルト値で上書きしますか？
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>このまま維持する</Button>
        <Button onClick={onConfirm} variant="contained">
          上書きする
        </Button>
      </DialogActions>
    </Dialog>
  );
}
