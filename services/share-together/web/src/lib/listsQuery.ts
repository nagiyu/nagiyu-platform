type ListsScope = 'personal' | 'shared';

type ListsSelection = {
  scope: ListsScope;
  groupId: string;
  listId: string;
};

/** クエリを読み取れる最小の形。URLSearchParams と ReadonlyURLSearchParams の両方を受ける。 */
type QueryReader = { get(name: string): string | null };

export const LISTS_PATH = '/lists';

/**
 * リスト画面のクエリから選択状態を読み取る。
 * scope は 'shared' 以外をすべて個人として扱い、未知の値でも画面が開けるようにする。
 */
export function parseListsQuery(params: QueryReader): ListsSelection {
  return {
    scope: params.get('scope') === 'shared' ? 'shared' : 'personal',
    groupId: params.get('groupId') ?? '',
    listId: params.get('listId') ?? '',
  };
}

/**
 * 選択状態をクエリ文字列 (先頭の `?` なし) にする。
 * 個人は scope と groupId を付けず、parseListsQuery が個人と解釈する形に揃える。
 * 共有は、リストが 0 件のグループやグループが無い状態も表せるよう、空の groupId と listId を省く。
 */
export function buildListsQuery(selection: ListsSelection): string {
  const query = new URLSearchParams();
  if (selection.scope === 'shared') {
    query.set('scope', 'shared');
    if (selection.groupId) {
      query.set('groupId', selection.groupId);
    }
  }
  if (selection.listId) {
    query.set('listId', selection.listId);
  }
  return query.toString();
}

/** 共有リストを開くリスト画面の URL (パスとクエリ) を返す。 */
export function buildSharedListHref(groupId: string, listId: string): string {
  const query = buildListsQuery({ scope: 'shared', groupId, listId });
  return `${LISTS_PATH}?${query}`;
}
