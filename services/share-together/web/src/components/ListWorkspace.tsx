'use client';

import { useEffect, useState } from 'react';
import { Box, FormControl, InputLabel, MenuItem, Select, Snackbar, Stack } from '@mui/material';
import { CreateItemDialog } from '@/components/CreateItemDialog';
import { ListSidebar, MOCK_PERSONAL_LISTS } from '@/components/ListSidebar';
import { TodoList } from '@/components/TodoList';
import type { GroupListsResponse, GroupsResponse } from '@/types';
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
} as const;

type ListWorkspaceProps = {
  initialListId: string;
  enablePersonalListApi?: boolean;
};

export function ListWorkspace({
  initialListId,
  enablePersonalListApi = false,
}: ListWorkspaceProps) {
  const [scope, setScope] = useState<'personal' | 'shared'>('personal');
  const [sharedGroups, setSharedGroups] = useState<readonly SharedGroup[]>([]);
  const [sharedListsByGroup, setSharedListsByGroup] = useState<
    Record<string, readonly SharedList[]>
  >({});
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState(initialListId);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

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

    const nextGroupId = matchingGroupId ?? (selectedGroupId || sharedGroups[0].groupId);
    if (nextGroupId !== selectedGroupId) {
      setSelectedGroupId(nextGroupId);
    }

    const nextLists = sharedListsByGroup[nextGroupId] ?? [];
    if (matchingGroupId && !enablePersonalListApi) {
      setScope('shared');
    }
    const hasSelectedListInSharedScope = nextLists.some((list) => list.listId === selectedListId);
    if (scope === 'shared' && nextLists.length > 0 && !hasSelectedListInSharedScope) {
      setSelectedListId(nextLists[0].listId);
    }
  }, [
    enablePersonalListApi,
    initialListId,
    scope,
    selectedGroupId,
    selectedListId,
    sharedGroups,
    sharedListsByGroup,
  ]);

  const sharedLists = sharedListsByGroup[selectedGroupId] ?? [];

  const sidebarLists =
    scope === 'personal' ? (enablePersonalListApi ? [] : MOCK_PERSONAL_LISTS) : sharedLists;
  const selectedInCurrentScope = sidebarLists.find((list) => list.listId === selectedListId);
  let currentListId: string;
  if (scope === 'shared') {
    currentListId = selectedInCurrentScope?.listId ?? sidebarLists[0]?.listId ?? '';
  } else if (scope === 'personal' && enablePersonalListApi) {
    currentListId = selectedListId;
  } else {
    currentListId = selectedInCurrentScope?.listId ?? sidebarLists[0]?.listId ?? selectedListId;
  }

  const handleCreateList = (name: string) => {
    setSnackbarMessage(
      scope === 'personal'
        ? `個人リスト「${name}」を作成しました（モック）。`
        : `共有リスト「${name}」を作成しました（モック）。`
    );
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
                let nextLists: readonly { listId: string; name: string }[] = [];
                if (nextScope === 'personal') {
                  nextLists = enablePersonalListApi ? [] : MOCK_PERSONAL_LISTS;
                } else {
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
            lists={sidebarLists}
            hrefPrefix={scope === 'personal' ? '/lists' : `/groups/${selectedGroupId}/lists`}
            onCreateList={
              scope === 'personal' && enablePersonalListApi
                ? undefined
                : () => setCreateDialogOpen(true)
            }
            apiEnabled={scope === 'personal' && enablePersonalListApi}
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
            apiEnabled={scope === 'personal' ? enablePersonalListApi : true}
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
