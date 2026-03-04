'use client';

import { useMemo, useState } from 'react';
import { Box, FormControl, InputLabel, MenuItem, Select, Snackbar, Stack } from '@mui/material';
import { CreateItemDialog } from '@/components/CreateItemDialog';
import { ListSidebar, MOCK_PERSONAL_LISTS } from '@/components/ListSidebar';
import { TodoList } from '@/components/TodoList';

const MOCK_SHARED_GROUPS = [
  { groupId: 'mock-family-group', name: '家族' },
  { groupId: 'mock-roommate-group', name: 'ルームメイト' },
  { groupId: 'mock-project-group', name: 'プロジェクトA' },
] as const;

const MOCK_SHARED_LISTS_BY_GROUP: Record<string, readonly { listId: string; name: string }[]> = {
  'mock-family-group': [
    { listId: 'mock-list-1', name: '買い物リスト（共有）' },
    { listId: 'mock-list-2', name: '旅行準備リスト' },
  ],
  'mock-roommate-group': [{ listId: 'mock-list-3', name: 'ルームメイト家事分担' }],
  'mock-project-group': [
    { listId: 'mock-list-4', name: 'プロジェクト進捗' },
    { listId: 'mock-list-5', name: 'アイデア共有' },
  ],
};

const PERSONAL_LIST_IDS = new Set<string>(MOCK_PERSONAL_LISTS.map((list) => list.listId));

type ListWorkspaceProps = {
  initialListId: string;
  enablePersonalListApi?: boolean;
};

export function ListWorkspace({
  initialListId,
  enablePersonalListApi = false,
}: ListWorkspaceProps) {
  const initialSharedGroupId =
    Object.entries(MOCK_SHARED_LISTS_BY_GROUP).find(([, lists]) =>
      lists.some((list) => list.listId === initialListId)
    )?.[0] ?? MOCK_SHARED_GROUPS[0].groupId;
  const initialScope =
    enablePersonalListApi || PERSONAL_LIST_IDS.has(initialListId) ? 'personal' : 'shared';
  const [scope, setScope] = useState<'personal' | 'shared'>(initialScope);
  const [selectedGroupId, setSelectedGroupId] = useState(initialSharedGroupId);
  const [selectedListId, setSelectedListId] = useState(initialListId);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const sharedLists = useMemo(
    () => MOCK_SHARED_LISTS_BY_GROUP[selectedGroupId] ?? [],
    [selectedGroupId]
  );

  const sidebarLists = scope === 'personal' ? MOCK_PERSONAL_LISTS : sharedLists;
  const selectedInCurrentScope = sidebarLists.find((list) => list.listId === selectedListId);
  const currentListId = selectedInCurrentScope?.listId ?? sidebarLists[0]?.listId ?? selectedListId;

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
                const nextLists =
                  nextScope === 'personal'
                    ? MOCK_PERSONAL_LISTS
                    : (MOCK_SHARED_LISTS_BY_GROUP[selectedGroupId] ?? []);
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
                  const nextLists = MOCK_SHARED_LISTS_BY_GROUP[nextGroupId] ?? [];
                  setSelectedGroupId(nextGroupId);
                  if (nextLists.length > 0) {
                    setSelectedListId(nextLists[0].listId);
                  }
                }}
              >
                {MOCK_SHARED_GROUPS.map((group) => (
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
            hrefPrefix="/lists"
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
        <TodoList
          key={currentListId}
          scope={scope === 'personal' ? 'personal' : 'group'}
          listId={currentListId}
        />
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
