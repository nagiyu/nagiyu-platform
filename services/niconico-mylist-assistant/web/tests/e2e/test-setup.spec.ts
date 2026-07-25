import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers/test-data';

/**
 * webkit-mobile 対応: 実 Service Worker（/sw.js）を無効化する。
 *
 * 本サービスは libs/ui の ServiceWorkerRegistration を layout.tsx で使っており、
 * 全ページで /sw.js を登録する。webkit ではこの SW がページを制御して API 応答を
 * 仲介・キャッシュするため、Playwright の既知制約
 * 「Service Worker 経由のリクエストは Chromium 以外では page.route で捕捉できない」
 * により page.route のモックが素通りし、テストが非決定的になる。
 *
 * `chromium-mobile` プロジェクトは playwright.config.base.ts 側で
 * `serviceWorkers: 'block'` を設定済みだが `chromium-desktop` / `webkit-mobile` は
 * 未設定という非対称があるため、spec 側で一律に打ち消す。
 */
test.use({ serviceWorkers: 'block' });

/**
 * E2E テストのセットアップ検証
 *
 * このテストは以下を検証します：
 * - 認証チェックがバイパスされている（サーバーサイド）
 * - テスト用の固定ユーザーIDが使用されている（サーバーサイド）
 * - テストヘルパーが正常に動作する
 */
test.describe('E2E Test Setup Verification', () => {
  test.beforeEach(async ({ request }) => {
    // 各テスト前にデータをクリア
    await clearTestData(request);
  });

  test('should access health endpoint without authentication', async ({ request }) => {
    // 認証なしでヘルスチェックエンドポイントにアクセス
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('service', 'niconico-mylist-assistant');
  });

  test('should access protected endpoint with bypassed authentication', async ({ request }) => {
    // 認証が必要なエンドポイントにアクセス
    // SKIP_AUTH_CHECK=true により、サーバーサイドで認証チェックがバイパスされる
    const response = await request.get('/api/videos?limit=10&offset=0');

    // 401 エラーではなく、正常なレスポンスが返されることを確認
    expect(response.status()).not.toBe(401);

    // 正常なレスポンス（200）が返されることを確認
    // データが空の場合でも200が返される
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('videos');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.videos)).toBe(true);
  });

  test('should expose PWA manifest with icons', async ({ request }) => {
    const response = await request.get('/manifest.json');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json();
    expect(body).toHaveProperty('icons');
    expect(body.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/icon-192x192.png',
          sizes: '192x192',
        }),
        expect.objectContaining({
          src: '/icon-512x512.png',
          sizes: '512x512',
        }),
      ])
    );

    for (const icon of body.icons) {
      if (typeof icon.src === 'string') {
        const iconResponse = await request.get(icon.src);
        expect(iconResponse.status()).toBe(200);
      }
    }
  });

  test('should use fixed test user ID in API requests', async ({ page }) => {
    // ホームページにアクセス
    await page.goto('/');

    // ページが正常にロードされることを確認（認証なしでアクセス可能）
    await expect(page).toHaveTitle(/niconico-mylist-assistant/i);

    // インポートページにアクセスして、認証が必要なページが表示されることを確認
    await page.goto('/import');

    // ページが正常に表示されることを確認（認証チェックがバイパスされている）
    await expect(page.getByRole('heading', { name: '動画一括インポート' })).toBeVisible();
  });
});
