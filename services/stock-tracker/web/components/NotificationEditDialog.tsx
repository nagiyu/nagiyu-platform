'use client';

import { useState } from 'react';
import { Box, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Button, TextField } from '@nagiyu/ui';

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
        <Box sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label="通知タイトル"
            value={localTitle}
            onChange={(event) => setLocalTitle(event.target.value)}
            maxLength={120}
          />
        </Box>
        <Box sx={{ mt: 2 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="通知本文"
            value={localBody}
            onChange={(event) => setLocalBody(event.target.value)}
            maxLength={500}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="ghost">
          キャンセル
        </Button>
        <Button onClick={() => onSave(localTitle, localBody)} variant="solid">
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
