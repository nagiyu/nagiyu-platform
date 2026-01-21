import { test, expect } from '@playwright/test';

test.describe('Health Check API', () => {
  test('GET /api/health returns status ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toEqual({ status: 'ok' });
  });
});

test.describe('Home Page', () => {
  test('displays the application title', async ({ page }) => {
    await page.goto('/');
    
    // タイトルの確認
    await expect(page.locator('h1')).toContainText('niconico-mylist-assistant');
    
    // 説明文の確認
    await expect(page.locator('p')).toContainText('ニコニコ動画のマイリスト登録を自動化する補助ツール');
  });

  test('has proper accessibility structure', async ({ page }) => {
    await page.goto('/');
    
    // main要素が存在することを確認
    await expect(page.locator('main')).toBeVisible();
    
    // h1要素が存在することを確認
    await expect(page.locator('h1')).toBeVisible();
  });
});
