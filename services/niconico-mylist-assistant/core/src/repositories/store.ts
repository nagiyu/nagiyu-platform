/**
 * NiconicoMylistAssistant Core - InMemory Store Singleton
 *
 * InMemorySingleTableStore のシングルトンインスタンス管理
 * Video と UserSetting で共有される共通ストア
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';

/**
 * シングルトンインスタンス
 * Video と UserSetting で共有される
 */
let storeInstance: InMemorySingleTableStore | null = null;

/**
 * InMemorySingleTableStore のシングルトンインスタンスを取得
 *
 * @returns InMemorySingleTableStore インスタンス
 *
 * @remarks
 * Video Repository と UserSetting Repository で共有されるストアを返す。
 * Single Table Design を再現するため、全リポジトリで同じストアを使用する。
 */
export function getInMemoryStore(): InMemorySingleTableStore {
  if (!storeInstance) {
    storeInstance = new InMemorySingleTableStore();
  }
  return storeInstance;
}

/**
 * InMemorySingleTableStore をクリアする（テスト用）
 *
 * @remarks
 * テスト間でデータを独立させるために使用する。
 * 本番環境では使用しない。
 */
export function clearInMemoryStore(): void {
  if (storeInstance) {
    storeInstance.clear();
    storeInstance = null;
  }
}
