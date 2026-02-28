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
  const [createdCount, setCreatedCount] = useState(0);

  const handleCreateList = () => {
    setCreatedCount((prev) => prev + 1);
  };
  const mockLists = [
    ...lists,
    ...Array.from({ length: createdCount }, (_, index) => ({
      listId: `mock-created-list-${index + 1}`,
      name: `新規リスト（モック${index + 1}）`,
    })),
  ];

  return (
    <Paper component="aside" sx={{ p: 2 }}>
      <Typography variant="h6" component="h3" gutterBottom>
        {heading}
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" fullWidth onClick={handleCreateList}>
          {createButtonLabel}
        </Button>
      </Box>
      <List disablePadding>
        {mockLists.map((list) => (
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
