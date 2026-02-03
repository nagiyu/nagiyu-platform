/**
 * E2E テスト用データヘルパー
 *
 * インメモリDBを使用したテストでのデータ管理を提供する
 */

import { clearInMemoryStore } from '@nagiyu/niconico-mylist-assistant-core';

/**
 * テストデータをクリアする
 *
 * @remarks
 * - beforeEach フックで呼び出してテスト間のデータ独立性を保証
 * - InMemorySingleTableStore に格納されたすべてのデータを削除
 * - DynamoDB実装では使用しない（USE_IN_MEMORY_DB=true の場合のみ有効）
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await clearTestData();
 * });
 * ```
 */
export async function clearTestData(): Promise<void> {
  // 環境変数チェック：インメモリDB使用時のみクリア
  if (process.env.USE_IN_MEMORY_DB !== 'true') {
    console.warn('clearTestData: USE_IN_MEMORY_DB が true でないため、スキップします');
    return;
  }

  clearInMemoryStore();
}

/**
 * テストデータをシードする
 *
 * @remarks
 * - 現在は空の実装
 * - 将来的に共通のテストデータが必要になった場合に実装
 * - テストごとに必要なデータは各テストケース内で作成することを推奨
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await clearTestData();
 *   await seedTestData();
 * });
 * ```
 */
export async function seedTestData(): Promise<void> {
  // 将来的な拡張用
  // 共通のテストデータが必要になった場合にここに実装
}
