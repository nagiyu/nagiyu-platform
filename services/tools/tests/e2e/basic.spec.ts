import { test, expect, suppressMigrationDialog } from './helpers';

test.describe('Tools App - Basic Functionality', () => {
  test('should load the homepage', async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');

    // Check if the page title is correct
    await expect(page).toHaveTitle(/Tools/);

    // Check if the main heading exists
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('should navigate to transit converter', async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');

    // ホームページのツールカードから乗り換え変換ツールへ遷移できることを検証する
    // (以前はリンクの有無で分岐しており、リンクが無くても green になる形骸化テストだった)
    const transitLink = page.getByRole('link', { name: /乗り換え/i });
    await expect(transitLink.first()).toBeVisible();
    await transitLink.first().click();
    await expect(page).toHaveURL(/transit-converter/);
  });

  test('should have responsive layout on mobile', async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');

    // Verify the page loads successfully
    // Note: viewport サイズ自体は Playwright の project 設定が決めるものであり、
    // ここで viewport.width を再アサートしても config の値を確認し直すだけの
    // トートロジーになるため削除した（desktop project では何も検証しない片手落ちでもあった）。
    await expect(page.locator('body')).toBeVisible();
  });
});
