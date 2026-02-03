/**
 * E2E テスト用のデータ管理ヘルパー
 *
 * インメモリ DB を使用したテスト環境でのデータのクリアとシードを提供
 */

import { clearInMemoryStore } from '@nagiyu/niconico-mylist-assistant-core';

/**
 * テストデータをクリアする
 *
 * @remarks
 * beforeEach フックで呼び出すことで、テスト間のデータ独立性を保証する。
 * インメモリストアを完全にクリアし、次のテストに影響を与えないようにする。
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await clearTestData();
 * });
 * ```
 */
export async function clearTestData(): Promise<void> {
  // インメモリストアをクリア
  clearInMemoryStore();
}

/**
 * テストデータをシードする
 *
 * @param data - シードするデータ（オプション）
 *
 * @remarks
 * テストに必要な初期データをインメモリストアに投入する。
 * clearTestData() の後に呼び出すことで、特定の初期状態を再現できる。
 *
 * 現在は基本的なクリアのみを実装しているが、将来的には
 * 特定のテストシナリオに合わせた初期データの投入機能を追加できる。
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await clearTestData();
 *   await seedTestData({
 *     videos: [
 *       { videoId: 'sm9', title: 'Test Video 1' },
 *       { videoId: 'sm10', title: 'Test Video 2' },
 *     ],
 *   });
 * });
 * ```
 */
export async function seedTestData(data?: {
  videos?: Array<{ videoId: string; title: string }>;
  userSettings?: Array<{ userId: string; videoId: string; isFavorite?: boolean; isSkip?: boolean }>;
}): Promise<void> {
  // 現時点では、データのシードは実装しない
  // 各テストで必要なデータは、API経由で投入する方針
  // 将来的に共通のシードデータが必要になった場合は、ここに実装を追加する
  void data; // unused parameter
}
