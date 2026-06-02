import type { NoteListItem } from './types';

/**
 * ノート UI から `/api/notes` を呼ぶための fetch ラッパ。
 *
 * コンポーネントから fetch を直接呼ばず、ここに集約してテスト可能にする
 * （カバレッジ計測対象は `src/lib/**` のみ）。
 */

export const NOTE_API_ERROR_MESSAGES = {
  LIST_FAILED: 'ノートの取得に失敗しました',
  DETAIL_FAILED: 'ノートの取得に失敗しました',
} as const;

/**
 * ノート一覧を取得する（本文なし）。
 */
export async function fetchNotes(): Promise<NoteListItem[]> {
  const res = await fetch('/api/notes', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(NOTE_API_ERROR_MESSAGES.LIST_FAILED);
  }
  const data = (await res.json()) as { notes?: NoteListItem[] };
  return data.notes ?? [];
}

/**
 * 単一ノートの詳細を取得する（本文あり）。
 */
export async function fetchNote(id: string): Promise<NoteListItem> {
  const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(NOTE_API_ERROR_MESSAGES.DETAIL_FAILED);
  }
  const data = (await res.json()) as { note: NoteListItem };
  return data.note;
}
