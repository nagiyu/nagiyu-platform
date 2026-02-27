'use client';

import { Box, Button, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
import { useState } from 'react';

const MOCK_LISTS = [
  { listId: 'mock-default-list', name: 'デフォルトリスト' },
  { listId: 'mock-work-list', name: '仕事' },
  { listId: 'mock-shopping-list', name: '買い物' },
] as const;

export function ListSidebar() {
  const [selectedListId, setSelectedListId] = useState<(typeof MOCK_LISTS)[number]['listId']>(
    MOCK_LISTS[0].listId
  );

  return (
    <Paper component="aside" sx={{ p: 2 }}>
      <Typography variant="h6" component="h3" gutterBottom>
        個人リスト
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" fullWidth>
          個人リストを作成
        </Button>
      </Box>
      <List disablePadding>
        {MOCK_LISTS.map((list) => (
          <ListItemButton
            key={list.listId}
            selected={selectedListId === list.listId}
            onClick={() => setSelectedListId(list.listId)}
          >
            <ListItemText primary={list.name} />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  );
}
