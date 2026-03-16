'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';

interface NotificationEditDialogProps {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
  onSave: (title: string, body: string) => void;
}

export default function NotificationEditDialog({
  open,
  title,
  body,
  onClose,
  onSave,
}: NotificationEditDialogProps) {
  const [localTitle, setLocalTitle] = useState<string>(title);
  const [localBody, setLocalBody] = useState<string>(body);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>通知設定を編集</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="通知タイトル"
          value={localTitle}
          onChange={(event) => setLocalTitle(event.target.value)}
          inputProps={{ maxLength: 120 }}
          sx={{ mt: 1 }}
        />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="通知本文"
          value={localBody}
          onChange={(event) => setLocalBody(event.target.value)}
          inputProps={{ maxLength: 500 }}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={() => onSave(localTitle, localBody)} variant="contained">
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
