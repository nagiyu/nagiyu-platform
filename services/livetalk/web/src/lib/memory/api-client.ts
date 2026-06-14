import type { Tier } from '@nagiyu/livetalk-core';
import type { MemoryListItem } from './types';

/**
 * 記憶 UI から `/api/memory` を呼ぶための fetch ラッパ。
 *
 * コンポーネントから fetch を直接呼ばず、ここに集約してテスト可能にする
 * （カバレッジ計測対象は `src/lib/**` のみ）。
 */

export const MEMORY_API_ERROR_MESSAGES = {
  LIST_FAILED: '記憶の取得に失敗しました',
  DELETE_FAILED: '記憶の削除に失敗しました',
  PIN_FAILED: '記憶の固定に失敗しました',
} as const;

/**
 * 指定 Tier の記憶一覧を取得する。tier 未指定なら全 Tier（API 側既定）。
 * characterId を渡すと選択中キャラの記憶に絞り込む（省略時は API 側既定）。
 */
export async function fetchMemories(tier?: Tier, characterId?: string): Promise<MemoryListItem[]> {
  const params = new URLSearchParams();
  if (tier) params.set('tier', tier);
  if (characterId) params.set('characterId', characterId);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(`/api/memory${query}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(MEMORY_API_ERROR_MESSAGES.LIST_FAILED);
  }
  const data = (await res.json()) as { memories?: MemoryListItem[] };
  return data.memories ?? [];
}

/**
 * 記憶を物理削除する。
 * characterId を渡すと選択中キャラの記憶に絞り込む（省略時は API 側既定）。
 */
export async function deleteMemory(id: string, characterId?: string): Promise<void> {
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

/**
 * 記憶を Tier A に昇格固定（ピン留め）する。
 * characterId を渡すと選択中キャラの記憶に絞り込む（省略時は API 側既定）。
 */
export async function pinMemory(id: string, characterId?: string): Promise<MemoryListItem> {
  const params = new URLSearchParams();
  if (characterId) params.set('characterId', characterId);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(`/api/memory/${encodeURIComponent(id)}/pin${query}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(MEMORY_API_ERROR_MESSAGES.PIN_FAILED);
  }
  const data = (await res.json()) as { memory: MemoryListItem };
  return data.memory;
}
