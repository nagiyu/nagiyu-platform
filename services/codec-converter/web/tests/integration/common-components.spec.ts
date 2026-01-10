/**
 * Codec Converter - E2E Test: Common Components (Header and Footer)
 *
 * 共通コンポーネントのテスト:
 * - Header が全ページで表示されること
 * - Footer が全ページで表示されること
 * - Header のタイトルクリックでトップページに戻ること
 * - Footer のバージョン情報が表示されること
 *
 * Note: このテストは Material-UI 導入後に追加されました
 * 参考: services/tools/e2e/homepage.spec.ts (L132-L193)
 */

import { test, expect } from './helpers';

test.describe('Common Components - Header and Footer', () => {
  test('should display header on homepage', async ({ page }) => {
    await page.goto('/');

    // Verify header is visible
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Verify app name "Codec Converter" is displayed in header
    const appName = page.getByRole('link', { name: /Codec Converter/i }).first();
    await expect(appName).toBeVisible();
    await expect(appName).toHaveAttribute('href', '/');
  });

  test('should display footer on homepage', async ({ page }) => {
    await page.goto('/');

    // Verify footer is visible
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Verify version information is displayed
    const version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();
  });

  test('should display header on all pages', async ({ page }) => {
    // Test on homepage
    await page.goto('/');
    let header = page.locator('header');
    await expect(header).toBeVisible();

    const appName = page.getByRole('link', { name: /Codec Converter/i }).first();
    await expect(appName).toBeVisible();

    // Test on job details page (with non-existent job ID for quick test)
    // Note: This will show an error, but we're only testing that header is visible
    await page.goto('/jobs/00000000-0000-0000-0000-000000000000');
    header = page.locator('header');
    await expect(header).toBeVisible();

    const appNameOnJobPage = page.getByRole('link', { name: /Codec Converter/i }).first();
    await expect(appNameOnJobPage).toBeVisible();
  });

  test('should display footer on all pages', async ({ page }) => {
    // Test on homepage
    await page.goto('/');
    let footer = page.locator('footer');
    await expect(footer).toBeVisible();

    let version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();

    // Test on job details page (with non-existent job ID for quick test)
    await page.goto('/jobs/00000000-0000-0000-0000-000000000000');
    footer = page.locator('footer');
    await expect(footer).toBeVisible();

    version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();
  });

  test('should navigate to homepage when clicking header title', async ({ page }) => {
    // Start on a job details page
    await page.goto('/jobs/00000000-0000-0000-0000-000000000000');

    // Verify we're on the job details page
    await expect(page).toHaveURL(/\/jobs\//);

    // Click on the app name in the header
    const appName = page.getByRole('link', { name: /Codec Converter/i }).first();
    await expect(appName).toBeVisible();
    await appName.click();

    // Verify we're redirected to the homepage
    await expect(page).toHaveURL('/');

    // Verify the main heading is visible
    await expect(page.getByRole('heading', { name: 'Codec Converter' })).toBeVisible();
  });

  test('should display header with accessible navigation', async ({ page }) => {
    await page.goto('/');

    // Verify header has proper semantic HTML
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Verify the app name is a link with accessible attributes
    const appName = page.getByRole('link', { name: /Codec Converter/i }).first();
    await expect(appName).toHaveAttribute('href', '/');

    // Verify the link is keyboard accessible (can be focused)
    await appName.focus();
    await expect(appName).toBeFocused();
  });

  test('should display footer with version and accessibility', async ({ page }) => {
    await page.goto('/');

    // Verify footer has proper semantic HTML
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Verify version text follows semantic versioning pattern
    const version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();

    const versionText = await version.textContent();
    expect(versionText).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});
