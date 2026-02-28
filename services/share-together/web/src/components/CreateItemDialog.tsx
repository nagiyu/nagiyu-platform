'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';

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
        <TextField
          autoFocus
          fullWidth
          label={label}
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>キャンセル</Button>
        <Button onClick={handleCreate} variant="contained" disabled={!name.trim()}>
          作成
        </Button>
      </DialogActions>
    </Dialog>
  );
}
