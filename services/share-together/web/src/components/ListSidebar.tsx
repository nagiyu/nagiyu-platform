'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import type { ApiErrorResponse, PersonalListResponse, PersonalListsResponse } from '@/types';

export const MOCK_PERSONAL_LISTS = [
  { listId: 'mock-default-list', name: 'デフォルトリスト' },
  { listId: 'mock-work-list', name: '仕事' },
  { listId: 'mock-shopping-list', name: '買い物' },
] as const;

type SidebarList = {
  listId: string;
  name: string;
  isDefault?: boolean;
};

type ListSidebarProps = {
  heading: string;
  createButtonLabel: string;
  selectedListId: string;
  lists?: readonly SidebarList[];
  hrefPrefix: string;
  onCreateList?: () => void;
  apiEnabled?: boolean;
};

const ERROR_MESSAGES = {
  LISTS_FETCH_FAILED: '個人リスト一覧の取得に失敗しました',
  LIST_CREATE_FAILED: '個人リストの作成に失敗しました',
  LIST_UPDATE_FAILED: '個人リスト名の更新に失敗しました',
  LIST_DELETE_FAILED: '個人リストの削除に失敗しました',
} as const;

async function getErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorResponse;
    if (body?.error?.message && typeof body.error.message === 'string') {
      return body.error.message;
    }
  } catch {
    // no-op
  }

  return fallbackMessage;
}

export function ListSidebar({
  heading,
  createButtonLabel,
  selectedListId,
  lists = [],
  hrefPrefix,
  onCreateList,
  apiEnabled = false,
}: ListSidebarProps) {
  const [apiLists, setApiLists] = useState<readonly SidebarList[]>([]);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const displayedLists = apiEnabled ? apiLists : lists;
  const navigateToList = (listId: string) => {
    globalThis.history.pushState(null, '', `${hrefPrefix}/${listId}`);
  };

  useEffect(() => {
    if (!apiEnabled) {
      return;
    }

    void globalThis
      .fetch('/api/lists')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, ERROR_MESSAGES.LISTS_FETCH_FAILED));
        }
        const result = (await response.json()) as PersonalListsResponse;
        setApiLists(result.data.lists);
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.LISTS_FETCH_FAILED, { error });
        setSnackbarMessage(
          error instanceof Error ? error.message : ERROR_MESSAGES.LISTS_FETCH_FAILED
        );
      });
  }, [apiEnabled]);

  const handleCreateList = () => {
    if (!apiEnabled) {
      onCreateList?.();
      return;
    }

    const name = globalThis.prompt('新しい個人リスト名を入力してください');
    if (!name?.trim()) {
      return;
    }

    void globalThis
      .fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, ERROR_MESSAGES.LIST_CREATE_FAILED));
        }
        const result = (await response.json()) as PersonalListResponse;
        setApiLists((prev) => [...prev, result.data]);
        navigateToList(result.data.listId);
        setSnackbarMessage('個人リストを作成しました。');
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.LIST_CREATE_FAILED, { error });
        setSnackbarMessage(
          error instanceof Error ? error.message : ERROR_MESSAGES.LIST_CREATE_FAILED
        );
      });
  };

  const handleRenameList = (list: SidebarList) => {
    const name = globalThis.prompt('個人リスト名を入力してください', list.name);
    if (!name?.trim() || name.trim() === list.name) {
      return;
    }

    void globalThis
      .fetch(`/api/lists/${encodeURIComponent(list.listId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, ERROR_MESSAGES.LIST_UPDATE_FAILED));
        }
        const result = (await response.json()) as PersonalListResponse;
        setApiLists((prev) =>
          prev.map((target) => (target.listId === list.listId ? result.data : target))
        );
        setSnackbarMessage('個人リスト名を更新しました。');
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.LIST_UPDATE_FAILED, { error, listId: list.listId });
        setSnackbarMessage(
          error instanceof Error ? error.message : ERROR_MESSAGES.LIST_UPDATE_FAILED
        );
      });
  };

  const handleDeleteList = (list: SidebarList) => {
    if (!globalThis.confirm(`「${list.name}」を削除しますか？`)) {
      return;
    }

    void globalThis
      .fetch(`/api/lists/${encodeURIComponent(list.listId)}`, {
        method: 'DELETE',
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, ERROR_MESSAGES.LIST_DELETE_FAILED));
        }
        setApiLists((prev) => {
          const updated = prev.filter((target) => target.listId !== list.listId);
          if (list.listId === selectedListId && updated.length > 0) {
            navigateToList(updated[0].listId);
          }
          return updated;
        });
        setSnackbarMessage('個人リストを削除しました。');
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.LIST_DELETE_FAILED, { error, listId: list.listId });
        setSnackbarMessage(
          error instanceof Error ? error.message : ERROR_MESSAGES.LIST_DELETE_FAILED
        );
      });
  };

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
        {displayedLists.map((list) => (
          <ListItem
            key={list.listId}
            disablePadding
            secondaryAction={
              apiEnabled ? (
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    aria-label={`${list.name}を編集`}
                    size="small"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleRenameList(list);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label={`${list.name}を削除`}
                    size="small"
                    disabled={list.isDefault === true}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleDeleteList(list);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ) : undefined
            }
          >
            <ListItemButton
              selected={selectedListId === list.listId}
              aria-current={selectedListId === list.listId ? 'page' : undefined}
              component={Link}
              href={`${hrefPrefix}/${list.listId}`}
            >
              <ListItemText primary={list.name} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </Paper>
  );
}
