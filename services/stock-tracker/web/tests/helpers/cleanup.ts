/**
 * テストクリーンアップヘルパー（ユニットテスト用）
 *
 * ユニットテスト実行時にリポジトリファクトリーのシングルトンインスタンスをリセットするヘルパー関数群
 * テスト間のインスタンス状態干渉を防ぐために使用します。
 *
 * **重要**: このヘルパーは主にユニットテスト用です。E2Eテストでは TestDataFactory の
 * cleanup() メソッドを使用してください。E2Eテストでこのヘルパーを使用すると、
 * モジュール解決の問題が発生する可能性があります。
 *
 * @example ユニットテストでの使用
 * ```typescript
 * import { cleanupRepositories } from './helpers/cleanup';
 *
 * describe('Repository Tests', () => {
 *   afterEach(async () => {
 *     await cleanupRepositories();
 *   });
 * });
 * ```
 */

import { clearMemoryStore } from '../../lib/repository-factory';

/**
 * 全リポジトリのシングルトンインスタンスをクリアンアップ
 *
 * リポジトリファクトリーのシングルトンインスタンスとメモリストアをクリアします。
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
 * - この関数は環境変数に関係なく常に実行されます
 * - `USE_IN_MEMORY_REPOSITORY=true` の場合: インメモリストアとリポジトリのシングルトンインスタンスがリセットされます
 * - DynamoDB モードの場合: リポジトリのシングルトンインスタンスのみがリセットされます
 * - **E2Eテストでは使用しないでください**: TestDataFactory.cleanup() を使用してください
 *
 * @example ユニットテストでの使用
 * ```typescript
 * afterEach(async () => {
 *   await cleanupRepositories();
 * });
 * ```
 */
export async function cleanupRepositories(): Promise<void> {
  // メモリストアと全リポジトリインスタンスをクリア
  clearMemoryStore();
}
