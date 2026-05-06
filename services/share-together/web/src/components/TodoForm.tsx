'use client';

import { useState } from 'react';
import { Box, TextField } from '@mui/material';
import { Button } from '@nagiyu/ui';

type TodoFormProps = {
  onAdd?: (title: string) => void;
};

export function TodoForm({ onAdd }: TodoFormProps) {
  const [title, setTitle] = useState('');
  const isTitleEmpty = title.trim() === '';

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isTitleEmpty) {
      return;
    }
    onAdd?.(title.trim());
    setTitle('');
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1 }}>
      <TextField
        label="タイトル"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        size="small"
        fullWidth
      />
      <Button type="submit" variant="solid" disabled={isTitleEmpty}>
        追加
      </Button>
    </Box>
  );
}
