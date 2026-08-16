import { test, expect } from '@playwright/test';

test.describe('Portal App - Basic Functionality', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Check if the page has a title
    await expect(page).toHaveTitle(/.+/);

    // Check if the main content area is visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('モバイル幅で横スクロールが発生しない', async ({ page }) => {
    // 旧実装は `if (isMobile) { expect(viewport.width).toBeLessThan(768) }` だった。
    // これは Playwright の config が設定した viewport を assert し直しているだけの
    // トートロジーで、desktop プロジェクトでは何も検証しなかった（1テスト=1結末に反する）。
    // ここでは viewport を明示的に固定し、コンテンツが画面幅を超えないことを検証する。
    const mobileWidth = 375;
    await page.setViewportSize({ width: mobileWidth, height: 667 });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(mobileWidth);
  });
});
