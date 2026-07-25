import type { APIRequestContext } from '@playwright/test';

/**
 * E2E テスト用データヘルパー
 *
 * `POST /api/test/videos` と `DELETE /api/test/videos`
 * （`USE_IN_MEMORY_DB=true` 環境専用の決定的シード API。
 * services/niconico-mylist-assistant/web/src/app/api/test/videos/route.ts）
 * を経由してテストデータを管理する。
 *
 * 以前は `POST /api/videos/bulk-import`（実ニコニコ動画 API を叩く経路）を
 * シードに使っていたが、外部 API 依存で非決定的だったため廃止した。
 * このファイルのヘルパーは実ニコニコ動画 API に一切依存しない。
 */

/**
 * テストデータを全件クリアする（API経由）
 *
 * @param request - Playwright の APIRequestContext
 *
 * @remarks
 * - beforeEach フックで呼び出してテスト間のデータ独立性を保証する
 * - `DELETE /api/test/videos` はインメモリDBストア全体を消すグローバル操作。
 *   Playwright はデフォルトでファイル間も並列実行する（`fullyParallel: true`）ため、
 *   このヘルパーを使うテストファイルは `test.describe.configure({ mode: 'serial' })`
 *   で直列化すること
 * - 失敗時は握り潰さず例外を投げる（前提条件が壊れたままテストが進むのを防ぐ）
 *
 * @example
 * ```typescript
 * test.beforeEach(async ({ request }) => {
 *   await clearTestData(request);
 * });
 * ```
 */
export async function clearTestData(request: APIRequestContext): Promise<void> {
  const response = await request.delete('/api/test/videos');
  if (!response.ok()) {
    throw new Error(
      `clearTestData: テストデータのクリアに失敗しました (status=${response.status()})`
    );
  }
}

/** `seedTestVideos` に渡すシードオプション（`POST /api/test/videos` のリクエストボディと一致） */
export interface SeedTestVideosOptions {
  /** 作成する動画の数 */
  count: number;
  /** 開始ID（省略時は API 側のデフォルト値） */
  startId?: number;
  /** 先頭から何件をお気に入りにするか */
  favoriteCount?: number;
  /** true の場合、動画基本情報のみ作成しユーザー設定は作成しない（create-on-missing 経路の検証用） */
  skipUserSetting?: boolean;
}

/**
 * `POST /api/test/videos` を呼び出し、決定的なテスト動画データをシードする
 *
 * @param request - Playwright の APIRequestContext
 * @param options - シード件数・開始ID・お気に入り件数等
 *
 * @remarks
 * - `USE_IN_MEMORY_DB=true` の環境でのみ有効な決定的シード API を使用する
 * - 実ニコニコ動画 API には依存しないため、外部要因によるテストのフレークが起きない
 * - 失敗時は握り潰さず例外を投げる
 *
 * @example
 * ```typescript
 * test('should display video list', async ({ page, request }) => {
 *   await clearTestData(request);
 *   await seedTestVideos(request, { count: 10, startId: 40000000 });
 *   await page.goto('/mylist');
 *   // テストコード
 * });
 * ```
 */
export async function seedTestVideos(
  request: APIRequestContext,
  options: SeedTestVideosOptions
): Promise<void> {
  const response = await request.post('/api/test/videos', { data: options });
  if (!response.ok()) {
    throw new Error(
      `seedTestVideos: テストデータのシードに失敗しました (status=${response.status()})`
    );
  }
}
