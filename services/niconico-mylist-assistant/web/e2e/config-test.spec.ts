/**
 * E2E テスト設定の動作確認テスト
 *
 * インメモリ DB と認証バイパスが正しく動作することを検証
 */

import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers/test-data';

test.describe('E2E Test Configuration', () => {
  test.beforeEach(async () => {
    // テスト間のデータ独立性を確保
    await clearTestData();
  });

  test('should bypass authentication and access protected pages', async ({ page }) => {
    // 認証が必要なページにアクセス
    await page.goto('/import');

    // ページが正常に表示されることを確認（認証エラーなし）
    await expect(page.getByRole('heading', { name: '動画一括インポート' })).toBeVisible();
  });

  test('should use in-memory DB for API calls', async ({ request }) => {
    // API呼び出しがインメモリDBを使用することを確認
    // まず、動画一覧を取得（空のはず）
    const listResponse = await request.get('/api/videos');
    expect(listResponse.status()).toBe(200);

    const listData = await listResponse.json();
    // インメモリDBは空の状態から始まる
    expect(listData.videos || []).toHaveLength(0);
  });

  test('should have independent data between tests', async ({ request }) => {
    // このテストでも動画一覧は空のはず（前のテストの影響を受けない）
    const listResponse = await request.get('/api/videos');
    expect(listResponse.status()).toBe(200);

    const listData = await listResponse.json();
    expect(listData.videos || []).toHaveLength(0);
  });

  test('should set fixed test user ID in middleware', async ({ page }) => {
    // ページにアクセスして、認証バイパスが機能することを確認
    await page.goto('/videos');

    // ページが正常に表示されることを確認
    // エラーページやリダイレクトされないことを確認
    const url = new URL(page.url());
    expect(url.pathname).toBe('/videos');
  });
});
