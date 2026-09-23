/**
 * E2E テスト用フィクスチャ
 *
 * `role` テストオプションでロールを指定すると、ページ遷移（`page`）・API 呼び出し
 * （`request`）双方の全 HTTP リクエストに `x-test-user-roles` ヘッダが付与される。
 * `libs/nextjs` の `createSessionGetter`（SKIP_AUTH_CHECK=true 時）がこのヘッダを
 * 読み取り、テストセッションのロールを上書きする。
 *
 * 使い方:
 * ```ts
 * import { test, expect } from './fixtures';
 *
 * test.describe('stock-viewer', () => {
 *   test.use({ role: ['stock-viewer'] });
 *
 *   test('...', async ({ page, request }) => { ... });
 * });
 * ```
 */

import { test as base, expect, type APIRequestContext } from '@playwright/test';

/**
 * テストロールを伝搬するリクエストヘッダ名。
 * `libs/nextjs` の `TEST_USER_ROLES_HEADER` と同じ値。
 */
export const TEST_USER_ROLES_HEADER = 'x-test-user-roles';

/**
 * 未指定時の既定ロール。既存の `.env.test` の `TEST_USER_ROLES=stock-admin` に揃える。
 */
const DEFAULT_ROLES = ['stock-admin'];

export interface RoleFixtures {
  /** このテスト（または describe）で使用するロール一覧。 */
  role: string[];
}

export const test = base.extend<RoleFixtures>({
  // テストオプション。test.use({ role: [...] }) で per-describe/per-file に上書きできる。
  role: [DEFAULT_ROLES, { option: true }],

  // ページ遷移・request フィクスチャ双方に role を反映する。
  // Playwright フィクスチャの `use` 引数を eslint-config-next の react-hooks プラグインが
  // React Hook と誤検知するため、このプロパティ全体で抑制する。
  /* eslint-disable react-hooks/rules-of-hooks */
  extraHTTPHeaders: async ({ role }, use) => {
    await use({ [TEST_USER_ROLES_HEADER]: role.join(',') });
  },
  /* eslint-enable react-hooks/rules-of-hooks */
});

export { expect };

/**
 * リクエストボディの seed データ型（サーバー側 `ResetSeedData` に対応）。
 * すべて任意項目。必要なフィールドのみ指定する。
 */
export interface ResetSeedData {
  exchanges?: Array<Record<string, unknown>>;
  tickers?: Array<Record<string, unknown>>;
  holdings?: Array<Record<string, unknown>>;
  alerts?: Array<Record<string, unknown>>;
}

/**
 * `/api/test/reset` を呼び出し、インメモリリポジトリをリセットする（USE_IN_MEMORY_DB=true 専用）。
 *
 * `seed` を渡すとリセット後にそのデータを投入する。
 *
 * @param request - Playwright の APIRequestContext（`role` フィクスチャ経由でヘッダが付与済み）
 * @param seed - リセット後に投入する seed データ（省略時はリセットのみ）
 */
export async function resetState(request: APIRequestContext, seed?: ResetSeedData): Promise<void> {
  const response = await request.post('/api/test/reset', {
    data: seed ?? {},
  });
  expect(response.ok()).toBeTruthy();
}
