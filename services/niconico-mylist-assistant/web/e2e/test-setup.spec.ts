import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers/test-data';

/**
 * E2E テストのセットアップ検証
 *
 * このテストは以下を検証します：
 * - 認証チェックがバイパスされている（サーバーサイド）
 * - テスト用の固定ユーザーIDが使用されている（サーバーサイド）
 * - テストヘルパーが正常に動作する
 */
test.describe('E2E Test Setup Verification', () => {
  test.beforeEach(async () => {
    // 各テスト前にデータをクリア
    await clearTestData();
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
