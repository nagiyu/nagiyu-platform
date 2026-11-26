/**
 * InMemory の auth ユーザー共有ストア
 *
 * Next.js dev ではモジュールがバンドルごとに複製されるため、globalThis に保持して
 * どこから呼んでも 1 つのストアを返す。
 */

import { InMemorySingleTableStore } from '../dynamodb/in-memory/single-table-store.js';

const GLOBAL_STORE_KEY = '__authUsersInMemoryStore__';

type GlobalWithStore = typeof globalThis & {
  [GLOBAL_STORE_KEY]?: InMemorySingleTableStore;
};

/**
 * InMemory の auth ユーザーを保持する共有ストアを返す。未生成なら作る。
 */
export function getInMemoryAuthUserStore(): InMemorySingleTableStore {
  const g = globalThis as GlobalWithStore;
  if (!g[GLOBAL_STORE_KEY]) {
    g[GLOBAL_STORE_KEY] = new InMemorySingleTableStore();
  }
  return g[GLOBAL_STORE_KEY];
}

/**
 * 共有ストアを破棄する。テスト用。次回の取得で空のストアが作られる。
 */
export function resetInMemoryAuthUserStore(): void {
  delete (globalThis as GlobalWithStore)[GLOBAL_STORE_KEY];
}
