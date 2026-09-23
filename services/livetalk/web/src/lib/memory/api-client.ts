import type { SelfFactListItem } from './types';

/**
 * 記憶 UI から `/api/memory` を呼ぶための fetch ラッパ。
 *
 * コンポーネントから fetch を直接呼ばず、ここに集約してテスト可能にする
 * （カバレッジ計測対象は `src/lib/**` のみ）。
 */

export const MEMORY_API_ERROR_MESSAGES = {
  LIST_FAILED: '覚えていることの取得に失敗しました',
  DELETE_FAILED: '覚えていることの削除に失敗しました',
} as const;

/**
 * SELF fact（私について覚えていること）の一覧を取得する。
 * characterId を渡すと選択中キャラの記憶に絞り込む（省略時は API 側既定）。
 */
export async function fetchSelfFacts(characterId?: string): Promise<SelfFactListItem[]> {
  const params = new URLSearchParams();
  if (characterId) params.set('characterId', characterId);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(`/api/memory${query}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(MEMORY_API_ERROR_MESSAGES.LIST_FAILED);
  }
  const data = (await res.json()) as { selfFacts?: SelfFactListItem[] };
  return data.selfFacts ?? [];
}

/**
 * SELF fact を決定的に削除する（忘却）。
 * characterId を渡すと選択中キャラの記憶に絞り込む（省略時は API 側既定）。
 */
export async function deleteSelfFact(id: string, characterId?: string): Promise<void> {
  const params = new URLSearchParams();
  if (characterId) params.set('characterId', characterId);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(`/api/memory/${encodeURIComponent(id)}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(MEMORY_API_ERROR_MESSAGES.DELETE_FAILED);
  }
}
