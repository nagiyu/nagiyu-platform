'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, Button, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';

export const MOCK_PERSONAL_LISTS = [
  { listId: 'mock-default-list', name: 'デフォルトリスト' },
  { listId: 'mock-work-list', name: '仕事' },
  { listId: 'mock-shopping-list', name: '買い物' },
] as const;

type SidebarList = {
  listId: string;
  name: string;
};

type ListSidebarProps = {
  heading: string;
  createButtonLabel: string;
  selectedListId: string;
  lists: readonly SidebarList[];
  hrefPrefix: string;
};

export function ListSidebar({
  heading,
  createButtonLabel,
  selectedListId,
  lists,
  hrefPrefix,
}: ListSidebarProps) {
  const [createClicked, setCreateClicked] = useState(false);

  return (
    <Paper component="aside" sx={{ p: 2 }}>
      <Typography variant="h6" component="h3" gutterBottom>
        {heading}
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" fullWidth onClick={() => setCreateClicked(true)}>
          {createButtonLabel}
        </Button>
        {createClicked ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {createButtonLabel} を押下しました（モック）
          </Typography>
        ) : null}
      </Box>
      <List disablePadding>
        {lists.map((list) => (
          <ListItemButton
            key={list.listId}
            selected={selectedListId === list.listId}
            aria-current={selectedListId === list.listId ? 'page' : undefined}
            component={Link}
            href={`${hrefPrefix}/${list.listId}`}
          >
            <ListItemText primary={list.name} />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  );
}
