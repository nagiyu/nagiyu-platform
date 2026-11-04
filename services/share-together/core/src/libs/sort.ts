interface CreatedAtEntity {
  createdAt: number;
}

/**
 * 作成日時の古い順に並べた新しい配列を返す。
 * DynamoDB のキーが UUID のため、リポジトリの返却順は作成順にならない。
 * 同時刻は ID の文字列比較で決め、取得のたびに並びが変わらないようにする。
 */
function sortByCreatedAt<T extends CreatedAtEntity>(
  items: readonly T[],
  getId: (item: T) => string
): T[] {
  return [...items].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    const idA = getId(a);
    const idB = getId(b);
    if (idA === idB) {
      return 0;
    }
    return idA < idB ? -1 : 1;
  });
}

/** ToDo を作成の古い順に並べる (入力は変更しない) */
export function sortTodosByCreatedAt<T extends CreatedAtEntity & { todoId: string }>(
  todos: readonly T[]
): T[] {
  return sortByCreatedAt(todos, (todo) => todo.todoId);
}

/** リストを作成の古い順に並べる (入力は変更しない) */
export function sortListsByCreatedAt<T extends CreatedAtEntity & { listId: string }>(
  lists: readonly T[]
): T[] {
  return sortByCreatedAt(lists, (list) => list.listId);
}

/** 個人リストをデフォルト先頭、残りを作成の古い順に並べる (入力は変更しない) */
export function sortPersonalLists<
  T extends CreatedAtEntity & { listId: string; isDefault: boolean },
>(lists: readonly T[]): T[] {
  const sorted = sortListsByCreatedAt(lists);
  return [...sorted.filter((list) => list.isDefault), ...sorted.filter((list) => !list.isDefault)];
}
