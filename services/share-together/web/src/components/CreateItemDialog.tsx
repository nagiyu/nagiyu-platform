'use client';

import { useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, Box } from '@mui/material';
import { Button, TextField } from '@nagiyu/ui';

type CreateItemDialogProps = {
  open: boolean;
  title: string;
  label: string;
  onClose: () => void;
  onCreate: (name: string) => void;
};

export function CreateItemDialog({ open, title, label, onClose, onCreate }: CreateItemDialogProps) {
  const [name, setName] = useState('');

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
    onClose();
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label={label}
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="sm"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} variant="ghost">
          キャンセル
        </Button>
        <Button onClick={handleCreate} variant="solid" disabled={!name.trim()}>
          作成
        </Button>
      </DialogActions>
    </Dialog>
  );
}
