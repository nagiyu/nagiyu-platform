'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Snackbar, Stack, Typography } from '@mui/material';
import { ConfirmDialog, Select, type SelectOption } from '@nagiyu/ui';
import { CreateItemDialog } from '@/components/CreateItemDialog';
import { ListSidebar } from '@/components/ListSidebar';
import { TodoList } from '@/components/TodoList';
import { LISTS_PATH, buildListsQuery } from '@/lib/listsQuery';
import type {
  GroupListResponse,
  GroupListsResponse,
  GroupsResponse,
  PersonalListsResponse,
} from '@/types';

type SharedGroup = {
  groupId: string;
  name: string;
};

type SharedList = {
  listId: string;
  name: string;
};

const SCOPE_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'personal', label: '個人' },
  { value: 'shared', label: '共有' },
];

const ERROR_MESSAGES = {
  SHARED_GROUPS_FETCH_FAILED: '共有グループ一覧の取得に失敗しました',
  SHARED_LISTS_FETCH_FAILED: '共有リスト一覧の取得に失敗しました',
  PERSONAL_LISTS_FETCH_FAILED: '個人リスト一覧の取得に失敗しました',
  SHARED_LIST_CREATE_FAILED: '共有リストの作成に失敗しました。',
  SHARED_LIST_RENAME_FAILED: '共有リスト名の更新に失敗しました。',
  SHARED_LIST_DELETE_FAILED: '共有リストの削除に失敗しました。',
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
  const searchParams = useSearchParams();
  const currentQuery = searchParams?.toString() ?? '';
  const [scope, setScope] = useState<'personal' | 'shared'>(initialScope);
  const [sharedGroups, setSharedGroups] = useState<readonly SharedGroup[]>([]);
  const [sharedListsByGroup, setSharedListsByGroup] = useState<
    Record<string, readonly SharedList[]>
  >({});
  const [selectedGroupId, setSelectedGroupId] = useState<string>(initialGroupId);
  const [selectedListId, setSelectedListId] = useState(initialListId);
  // 共有スコープから入った場合 initialListId は共有リストの ID なので、個人スコープの戻り先に使えない。
  // 個人スコープから入った場合のみ initialListId を戻り先の初期値にする。
  const [personalListId, setPersonalListId] = useState(
    initialScope === 'personal' ? initialListId : ''
  );
  // 共有グループと共有リストの取得が終わるまで、リストが 0 件なのか未取得なのかを区別するために持つ。
  const [isSharedDataLoaded, setIsSharedDataLoaded] = useState(false);
  // 読み込み後の補正 (デフォルトの選択、無効な groupId の修正など) では URL を書き換えない。
  // history.replaceState は実行待ちのナビゲーションを捨てるため、読み込み中にヘッダーから
  // 別の画面へ移ろうとした人の操作を黙って潰してしまう。人が選び直したあとだけ書き戻す。
  const [hasUserSelected, setHasUserSelected] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SharedList | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SharedList | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const getErrorMessage = async (response: Response): Promise<string> => {
    try {
      const data = (await response.json()) as { message?: string };
      if (typeof data.message === 'string') {
        return data.message;
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
        setIsSharedDataLoaded(true);
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
    if (initialScope === 'personal') {
      return;
    }

    const controller = new AbortController();

    const fetchDefaultPersonalList = async (): Promise<void> => {
      try {
        const response = await globalThis.fetch('/api/lists', { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }
        const result = (await response.json()) as PersonalListsResponse;
        const defaultList =
          result.data.lists.find((list) => list.isDefault) ?? result.data.lists[0];
        if (defaultList) {
          // 取得中にサイドバーで個人リストを選択済みなら、その選択を上書きしない。
          setPersonalListId((previous) => previous || defaultList.listId);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error(ERROR_MESSAGES.PERSONAL_LISTS_FETCH_FAILED, { error });
      }
    };

    void fetchDefaultPersonalList();

    return () => {
      controller.abort();
    };
  }, [initialScope]);

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
    currentListId = personalListId;
  }

  // リロード・URL 共有・前回表示の復元で選択を引き継げるよう、人が選び直したあとに表示中の選択を URL へ反映する。
  // router.replace はクエリが変わるたびにサーバーへ RSC を取りに行くため、useSearchParams と同期する
  // history.replaceState で書き換える。履歴は増やさない。
  useEffect(() => {
    if (!hasUserSelected) {
      return;
    }

    if (scope === 'personal' && !currentListId) {
      return;
    }

    // 共有は、取得が終わって groupId が確定するまで書き換えない。
    // 確定後にリストが無ければ listId を省き、groupId までの URL にする。
    const isSharedSelectionSettled =
      isSharedDataLoaded &&
      (sharedGroups.length === 0 ||
        sharedGroups.some((group) => group.groupId === selectedGroupId));
    if (scope === 'shared' && !isSharedSelectionSettled) {
      return;
    }

    const nextQuery = buildListsQuery({
      scope,
      groupId: selectedGroupId,
      listId: currentListId,
    });
    if (nextQuery === currentQuery) {
      return;
    }

    window.history.replaceState(null, '', `${LISTS_PATH}?${nextQuery}`);
  }, [
    hasUserSelected,
    scope,
    selectedGroupId,
    currentListId,
    currentQuery,
    isSharedDataLoaded,
    sharedGroups,
  ]);

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
      setHasUserSelected(true);
      setSnackbarMessage(`共有リスト「${createdList.name}」を作成しました。`);
    } catch (error) {
      setSnackbarMessage(
        error instanceof Error ? error.message : ERROR_MESSAGES.SHARED_LIST_CREATE_FAILED
      );
    }
  };

  const handleRenameSharedList = async (list: SharedList, name: string) => {
    if (name === list.name) {
      return;
    }

    const targetGroupId = selectedGroupId;
    try {
      const response = await globalThis.fetch(
        `/api/groups/${encodeURIComponent(targetGroupId)}/lists/${encodeURIComponent(list.listId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }
      );
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const result = (await response.json()) as GroupListResponse;
      const updatedList: SharedList = { listId: result.data.listId, name: result.data.name };
      setSharedListsByGroup((previous) => ({
        ...previous,
        [targetGroupId]: (previous[targetGroupId] ?? []).map((target) =>
          target.listId === list.listId ? updatedList : target
        ),
      }));
      setSnackbarMessage(`共有リスト名を更新しました。`);
    } catch (error) {
      setSnackbarMessage(
        error instanceof Error ? error.message : ERROR_MESSAGES.SHARED_LIST_RENAME_FAILED
      );
    }
  };

  const handleDeleteSharedList = async (list: SharedList) => {
    const targetGroupId = selectedGroupId;
    try {
      const response = await globalThis.fetch(
        `/api/groups/${encodeURIComponent(targetGroupId)}/lists/${encodeURIComponent(list.listId)}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      setHasUserSelected(true);
      setSharedListsByGroup((previous) => {
        const updated = (previous[targetGroupId] ?? []).filter(
          (target) => target.listId !== list.listId
        );
        if (list.listId === selectedListId && updated.length > 0) {
          setSelectedListId(updated[0].listId);
        } else if (list.listId === selectedListId) {
          setSelectedListId('');
        }
        return { ...previous, [targetGroupId]: updated };
      });
      setSnackbarMessage(`共有リストを削除しました。`);
    } catch (error) {
      setSnackbarMessage(
        error instanceof Error ? error.message : ERROR_MESSAGES.SHARED_LIST_DELETE_FAILED
      );
    }
  };

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
        <Stack spacing={2}>
          <Select
            id="list-scope-select"
            label="表示範囲"
            size="sm"
            fullWidth
            value={scope}
            onChange={(nextValue) => {
              const nextScope = nextValue as 'personal' | 'shared';
              setHasUserSelected(true);
              setScope(nextScope);
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
            options={SCOPE_OPTIONS}
          />
          {scope === 'shared' ? (
            <Select
              id="shared-group-select"
              label="グループ"
              size="sm"
              fullWidth
              value={selectedGroupId}
              onChange={(nextGroupId) => {
                const nextLists = sharedListsByGroup[nextGroupId] ?? [];
                setHasUserSelected(true);
                setSelectedGroupId(nextGroupId);
                if (nextLists.length > 0) {
                  setSelectedListId(nextLists[0].listId);
                }
              }}
              options={sharedGroups.map((group) => ({
                value: group.groupId,
                label: group.name,
              }))}
            />
          ) : null}
          <ListSidebar
            heading={scope === 'personal' ? '個人リスト' : '共有リスト'}
            createButtonLabel={scope === 'personal' ? '個人リストを作成' : '共有リストを作成'}
            selectedListId={currentListId}
            lists={scope === 'personal' ? undefined : sidebarLists}
            hrefPrefix={scope === 'personal' ? '/lists' : `/groups/${selectedGroupId}/lists`}
            onCreateList={scope === 'shared' ? () => setCreateDialogOpen(true) : undefined}
            onListSelect={(listId) => {
              setHasUserSelected(true);
              if (scope === 'personal') {
                setPersonalListId(listId);
              } else {
                setSelectedListId(listId);
              }
            }}
            onRenameList={scope === 'shared' ? setRenameTarget : undefined}
            onDeleteList={scope === 'shared' ? setDeleteTarget : undefined}
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
        ) : scope === 'shared' && isSharedDataLoaded ? (
          // 取得前は 0 件か未取得か区別できないので、取得が済んでから出す。
          <Typography color="text.secondary">
            共有リストはまだありません。「共有リストを作成」から追加できます。
          </Typography>
        ) : null}
      </Box>
      <CreateItemDialog
        open={createDialogOpen}
        title={scope === 'personal' ? '個人リストを作成' : '共有リストを作成'}
        label="リスト名"
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateList}
      />
      <CreateItemDialog
        open={renameTarget !== null}
        title="共有リスト名を変更"
        label="リスト名"
        initialValue={renameTarget?.name ?? ''}
        submitLabel="保存"
        onClose={() => setRenameTarget(null)}
        onCreate={(name) => {
          if (renameTarget) {
            void handleRenameSharedList(renameTarget, name);
          }
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="共有リストを削除"
        description={`「${deleteTarget?.name ?? ''}」を削除しますか？`}
        onConfirm={() => {
          if (deleteTarget) {
            void handleDeleteSharedList(deleteTarget);
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
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
