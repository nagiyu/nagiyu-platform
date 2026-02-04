/**
 * E2E テストクリーンアップヘルパー
 *
 * E2E テスト実行前後にインメモリリポジトリの状態をリセットするヘルパー関数群
 * テスト間のデータ干渉を防ぐために使用します。
 *
 * @example
 * ```typescript
 * import { cleanupRepositories } from './helpers/cleanup';
 *
 * test.describe('機能テスト', () => {
 *   test.afterEach(async () => {
 *     await cleanupRepositories();
 *   });
 * });
 * ```
 */

import { clearMemoryStore } from '../../lib/repository-factory';

/**
 * 全リポジトリのデータをクリーンアップ
 *
 * インメモリリポジトリのストアをクリアし、全リポジトリインスタンスをリセットします。
 * 以下のリポジトリ種別に対応:
 * - Alert
 * - Holding
 * - Ticker
 * - Exchange
 * - Watchlist
 *
 * @returns Promise<void>
 *
 * @remarks
 * - この関数は `USE_IN_MEMORY_REPOSITORY=true` の環境でのみ効果があります
 * - DynamoDB 実装を使用している場合、この関数は何もしません
 * - テストの `afterEach` または `afterAll` フックで呼び出すことを推奨します
 *
 * @example
 * ```typescript
 * test.afterEach(async () => {
 *   await cleanupRepositories();
 * });
 * ```
 */
export async function cleanupRepositories(): Promise<void> {
  // メモリストアと全リポジトリインスタンスをクリア
  clearMemoryStore();
}
