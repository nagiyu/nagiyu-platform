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

  test('モバイル幅で主要要素が画面内に収まる', async ({ page }) => {
    // 旧実装は `if (isMobile) { expect(viewport.width).toBeLessThan(768) }` だった。
    // これは Playwright の config が設定した viewport を assert し直しているだけの
    // トートロジーで、desktop プロジェクトでは何も検証しなかった（1テスト=1結末に反する）。
    // ここでは viewport を明示的に固定し、入力欄が画面幅を超えないことを検証する。
    const mobileWidth = 375;
    await page.setViewportSize({ width: mobileWidth, height: 667 });
    await page.goto('/');

    const input = page.getByPlaceholder('メッセージを入力');
    await expect(input).toBeVisible();

    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(mobileWidth);
  });
});
