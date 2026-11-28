/**
 * ページング付き一覧 API を最後のページまで辿って、1 つの配列にまとめる。
 *
 * 一覧 API は 1 回に返す件数に上限があり、続きは `lastKey` で取る。
 * 1 回だけ取得すると上限を超えた分が画面から落ちるため、`lastKey` が返らなくなるまで辿る。
 */

/** 1 回の取得件数。API が許す最大値にして、往復回数を減らす */
const PAGE_LIMIT = 100;

const ERROR_MESSAGES = {
  FETCH_FAILED: '一覧の取得に失敗しました',
  PAGINATION_STALLED: '一覧の取得が先に進まないため中断しました',
} as const;

interface PageResponse {
  pagination?: { lastKey?: string };
  [key: string]: unknown;
}

/**
 * 一覧 API の全ページを取得する。
 *
 * @param path - 一覧 API のパス (クエリは付けない)
 * @param itemsKey - 応答の中で配列が入っているキー (`holdings` / `alerts` など)
 * @returns 全ページの要素をつないだ配列
 * @throws 応答が失敗したとき、または同じ `lastKey` が続けて返ったとき。
 *   後者は API の不具合で無限に取得し続けないための打ち切り
 */
export async function fetchAllPages<T>(path: string, itemsKey: string): Promise<T[]> {
  const items: T[] = [];
  let lastKey: string | undefined;

  for (;;) {
    const query = `limit=${PAGE_LIMIT}${lastKey ? `&lastKey=${encodeURIComponent(lastKey)}` : ''}`;
    const response = await fetch(`${path}?${query}`);
    if (!response.ok) {
      throw new Error(ERROR_MESSAGES.FETCH_FAILED);
    }

    const data = (await response.json()) as PageResponse;
    const pageItems = data[itemsKey];
    if (Array.isArray(pageItems)) {
      items.push(...(pageItems as T[]));
    }

    const nextKey = data.pagination?.lastKey;
    if (!nextKey) {
      return items;
    }
    if (nextKey === lastKey) {
      throw new Error(ERROR_MESSAGES.PAGINATION_STALLED);
    }
    lastKey = nextKey;
  }
}
