/**
 * InMemory のエラーイベント共有ストア
 *
 * Writer (libs/aws) と Reader (admin) は別パッケージで、Next.js dev ではモジュールが
 * バンドルごとに複製されるため、モジュール変数では同じストアを指せない。
 * globalThis に保持して、どこから呼んでも 1 つのストアを返す。
 */

import { InMemorySingleTableStore } from '../dynamodb/in-memory/single-table-store.js';

const GLOBAL_STORE_KEY = '__errorEventInMemoryStore__';

type GlobalWithStore = typeof globalThis & {
  [GLOBAL_STORE_KEY]?: InMemorySingleTableStore;
};

/**
 * InMemory のエラーイベントを保持する共有ストアを返す。未生成なら作る。
 */
export function getInMemoryErrorEventStore(): InMemorySingleTableStore {
  const g = globalThis as GlobalWithStore;
  if (!g[GLOBAL_STORE_KEY]) {
    g[GLOBAL_STORE_KEY] = new InMemorySingleTableStore();
  }
  return g[GLOBAL_STORE_KEY];
}

/**
 * 共有ストアを破棄する。テスト用。次回の取得で空のストアが作られる。
 */
export function resetInMemoryErrorEventStore(): void {
  delete (globalThis as GlobalWithStore)[GLOBAL_STORE_KEY];
}
