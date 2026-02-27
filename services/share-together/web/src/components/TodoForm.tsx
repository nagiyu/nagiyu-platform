'use client';

import { useState } from 'react';
import { Box, Button, TextField } from '@mui/material';

export function TodoForm() {
  const [title, setTitle] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTitle('');
  };

  return (
    <Box component="form" onSubmit={handleSubmit} display="flex" gap={1}>
      <TextField
        label="タイトル"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        size="small"
        fullWidth
      />
      <Button type="submit" variant="contained">
        追加
      </Button>
    </Box>
  );
}
