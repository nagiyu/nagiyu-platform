import { test, expect } from '@playwright/test';

test.describe('LiveTalk - Basic Functionality', () => {
  test('should load the homepage with chat UI', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/LiveTalk/);

    // 入力欄が表示されている（プレースホルダーから検索）
    await expect(page.getByPlaceholder('メッセージを入力')).toBeVisible();

    // VOICEVOX ライセンス表記が表示されている
    await expect(page.getByText(/VOICEVOX/)).toBeVisible();
  });

  test('should respond from health endpoint', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('should have responsive layout on mobile', async ({ page, isMobile }) => {
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();

    if (isMobile) {
      const viewport = page.viewportSize();
      expect(viewport?.width).toBeLessThan(768);
    }
  });
});
