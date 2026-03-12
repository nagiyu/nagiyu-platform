'use client';

import { useEffect, useState } from 'react';
import { Box, FormControl, InputLabel, MenuItem, Select, Snackbar, Stack } from '@mui/material';
import { CreateItemDialog } from '@/components/CreateItemDialog';
import { ListSidebar } from '@/components/ListSidebar';
import { TodoList } from '@/components/TodoList';
import type { GroupListResponse, GroupListsResponse, GroupsResponse } from '@/types';
type SharedGroup = {
  groupId: string;
  name: string;
};

type SharedList = {
  listId: string;
  name: string;
};

const ERROR_MESSAGES = {
  SHARED_GROUPS_FETCH_FAILED: '共有グループ一覧の取得に失敗しました',
  SHARED_LISTS_FETCH_FAILED: '共有リスト一覧の取得に失敗しました',
  SHARED_LIST_CREATE_FAILED: '共有リストの作成に失敗しました。',
  OPERATION_FAILED: '操作に失敗しました。',
  SHARED_LIST_CREATE_SHARED_SCOPE_ONLY: '共有リスト作成は共有スコープでのみ利用できます。',
} as const;

type ListWorkspaceProps = {
  initialListId: string;
  initialScope?: 'personal' | 'shared';
  initialGroupId?: string;
};

export function ListWorkspace({
  initialListId,
  initialScope = 'personal',
  initialGroupId = '',
}: ListWorkspaceProps) {
  const [scope, setScope] = useState<'personal' | 'shared'>(initialScope);
  const [sharedGroups, setSharedGroups] = useState<readonly SharedGroup[]>([]);
  const [sharedListsByGroup, setSharedListsByGroup] = useState<
    Record<string, readonly SharedList[]>
  >({});
  const [selectedGroupId, setSelectedGroupId] = useState<string>(initialGroupId);
  const [selectedListId, setSelectedListId] = useState(initialListId);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const getErrorMessage = async (response: Response): Promise<string> => {
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      if (typeof data.error?.message === 'string') {
        return data.error.message;
      }
    } catch {
      // noop
    }
    return ERROR_MESSAGES.OPERATION_FAILED;
  };

  useEffect(() => {
    const controller = new AbortController();

    const fetchSharedData = async (): Promise<void> => {
      try {
        const groupsResponse = await globalThis.fetch('/api/groups', { signal: controller.signal });
        if (!groupsResponse.ok) {
          throw new Error(`status: ${groupsResponse.status}`);
        }
        const groupsResult = (await groupsResponse.json()) as GroupsResponse;
        const fetchedGroups = groupsResult.data.groups.map((group) => ({
          groupId: group.groupId,
          name: group.name,
        }));
        setSharedGroups(fetchedGroups);

        const sharedListEntries = await Promise.all(
          fetchedGroups.map(async (group) => {
            const listsResponse = await globalThis.fetch(
              `/api/groups/${encodeURIComponent(group.groupId)}/lists`,
              { signal: controller.signal }
            );
            if (!listsResponse.ok) {
              throw new Error(
                `${ERROR_MESSAGES.SHARED_LISTS_FETCH_FAILED}: ${listsResponse.status}`
              );
            }
            const listsResult = (await listsResponse.json()) as GroupListsResponse;
            const sharedLists = listsResult.data.lists.map((list) => ({
              listId: list.listId,
              name: list.name,
            }));
            return [group.groupId, sharedLists] as const;
          })
        );

        setSharedListsByGroup(Object.fromEntries(sharedListEntries));
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error(ERROR_MESSAGES.SHARED_GROUPS_FETCH_FAILED, { error });
      }
    };

    void fetchSharedData();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (sharedGroups.length === 0) {
      return;
    }

    const matchingGroupId = Object.entries(sharedListsByGroup).find(([, lists]) =>
      lists.some((list) => list.listId === initialListId)
    )?.[0];

    const nextGroupId =
      (selectedGroupId && sharedGroups.some((group) => group.groupId === selectedGroupId)
        ? selectedGroupId
        : undefined) ??
      matchingGroupId ??
      sharedGroups[0].groupId;
    if (nextGroupId !== selectedGroupId) {
      setSelectedGroupId(nextGroupId);
    }

    const nextLists = sharedListsByGroup[nextGroupId] ?? [];
    const hasSelectedListInSharedScope = nextLists.some((list) => list.listId === selectedListId);
    if (scope === 'shared' && nextLists.length > 0 && !hasSelectedListInSharedScope) {
      setSelectedListId(nextLists[0].listId);
    }
  }, [initialListId, scope, selectedGroupId, selectedListId, sharedGroups, sharedListsByGroup]);

  const sharedLists = sharedListsByGroup[selectedGroupId] ?? [];

  const sidebarLists = scope === 'personal' ? [] : sharedLists;
  const selectedInCurrentScope = sidebarLists.find((list) => list.listId === selectedListId);
  let currentListId: string;
  if (scope === 'shared') {
    currentListId = selectedInCurrentScope?.listId ?? sidebarLists[0]?.listId ?? '';
  } else {
    currentListId = selectedListId;
  }

  const handleCreateList = async (name: string) => {
    if (scope !== 'shared') {
      setSnackbarMessage(ERROR_MESSAGES.SHARED_LIST_CREATE_SHARED_SCOPE_ONLY);
      return;
    }

    if (!selectedGroupId) {
      setSnackbarMessage(ERROR_MESSAGES.SHARED_LIST_CREATE_FAILED);
      return;
    }

    const targetGroupId = selectedGroupId;
    try {
      const response = await globalThis.fetch(
        `/api/groups/${encodeURIComponent(targetGroupId)}/lists`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }
      );
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const result = (await response.json()) as GroupListResponse;
      const createdList: SharedList = {
        listId: result.data.listId,
        name: result.data.name,
      };
      setSharedListsByGroup((previous) => ({
        ...previous,
        [targetGroupId]: [...(previous[targetGroupId] ?? []), createdList],
      }));
      setSelectedListId(createdList.listId);
      setSnackbarMessage(`共有リスト「${createdList.name}」を作成しました。`);
    } catch (error) {
      setSnackbarMessage(
        error instanceof Error ? error.message : ERROR_MESSAGES.SHARED_LIST_CREATE_FAILED
      );
    }
  };

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
      <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
        <Stack spacing={2}>
          <FormControl fullWidth size="small">
            <InputLabel id="list-scope-select-label">表示範囲</InputLabel>
            <Select
              labelId="list-scope-select-label"
              id="list-scope-select"
              label="表示範囲"
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as 'personal' | 'shared';
                setScope(nextScope);
                if (nextScope === 'personal') {
                  setSelectedListId(initialListId);
                }
                let nextLists: readonly { listId: string; name: string }[] = [];
                if (nextScope === 'shared') {
                  nextLists = sharedLists;
                }
                if (nextScope === 'shared' && !selectedGroupId && sharedGroups.length > 0) {
                  setSelectedGroupId(sharedGroups[0].groupId);
                }
                if (nextLists.length > 0) {
                  setSelectedListId(nextLists[0].listId);
                }
              }}
            >
              <MenuItem value="personal">個人</MenuItem>
              <MenuItem value="shared">共有</MenuItem>
            </Select>
          </FormControl>
          {scope === 'shared' ? (
            <FormControl fullWidth size="small">
              <InputLabel id="shared-group-select-label">グループ</InputLabel>
              <Select
                labelId="shared-group-select-label"
                id="shared-group-select"
                label="グループ"
                value={selectedGroupId}
                onChange={(event) => {
                  const nextGroupId = event.target.value;
                  const nextLists = sharedListsByGroup[nextGroupId] ?? [];
                  setSelectedGroupId(nextGroupId);
                  if (nextLists.length > 0) {
                    setSelectedListId(nextLists[0].listId);
                  }
                }}
              >
                {sharedGroups.map((group) => (
                  <MenuItem key={group.groupId} value={group.groupId}>
                    {group.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
          <ListSidebar
            heading={scope === 'personal' ? '個人リスト' : '共有リスト'}
            createButtonLabel={scope === 'personal' ? '個人リストを作成' : '共有リストを作成'}
            selectedListId={currentListId}
            lists={scope === 'personal' ? undefined : sidebarLists}
            hrefPrefix={scope === 'personal' ? '/lists' : `/groups/${selectedGroupId}/lists`}
            onCreateList={scope === 'shared' ? () => setCreateDialogOpen(true) : undefined}
            onListSelect={(listId) => setSelectedListId(listId)}
          />
        </Stack>
      </Box>
      <Box sx={{ flexGrow: 1, width: '100%' }}>
        {currentListId ? (
          <TodoList
            key={currentListId}
            scope={scope === 'personal' ? 'personal' : 'group'}
            listId={currentListId}
            groupId={scope === 'shared' ? selectedGroupId : undefined}
          />
        ) : null}
      </Box>
      <CreateItemDialog
        open={createDialogOpen}
        title={scope === 'personal' ? '個人リストを作成' : '共有リストを作成'}
        label="リスト名"
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateList}
      />
      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </Stack>
  );
}
