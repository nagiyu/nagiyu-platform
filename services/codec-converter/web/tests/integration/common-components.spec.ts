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
  test('should display header on all pages', async ({ page }) => {
    // ホームページでテスト
    await page.goto('/');
    let header = page.locator('header');
    await expect(header).toBeVisible();

    // Note: .first() is used because the app name might appear in multiple locations
    const appName = page.getByRole('link', { name: /Codec Converter/i }).first();
    await expect(appName).toBeVisible();

    // ジョブ詳細ページでテスト
    // Note: Using a test UUID that will trigger the error state, allowing us to verify
    // that header is still rendered even when the page content shows an error.
    // This is a valid test scenario as we want header/footer to be present on all pages.
    await page.goto('/jobs/00000000-0000-0000-0000-000000000000');
    header = page.locator('header');
    await expect(header).toBeVisible();

    // Note: .first() is used because the app name might appear in multiple locations
    const appNameOnJobPage = page.getByRole('link', { name: /Codec Converter/i }).first();
    await expect(appNameOnJobPage).toBeVisible();
  });

  test('should display footer on all pages', async ({ page }) => {
    // ホームページでテスト
    await page.goto('/');
    let footer = page.locator('footer');
    await expect(footer).toBeVisible();

    let version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();

    // ジョブ詳細ページでテスト
    // Note: Using a test UUID to verify footer is present even on error pages
    await page.goto('/jobs/00000000-0000-0000-0000-000000000000');
    footer = page.locator('footer');
    await expect(footer).toBeVisible();

    version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();
  });

  test('should navigate to homepage when clicking header title', async ({ page }) => {
    // ジョブ詳細ページから開始（テストUUIDを使用）
    await page.goto('/jobs/00000000-0000-0000-0000-000000000000');

    // ジョブ詳細ページにいることを確認
    await expect(page).toHaveURL(/\/jobs\//);

    // Headerのアプリ名をクリック
    // Note: .first() is used because the app name might appear in multiple locations
    const appName = page.getByRole('link', { name: /Codec Converter/i }).first();
    await expect(appName).toBeVisible();
    await appName.click();

    // ホームページにリダイレクトされることを確認
    await expect(page).toHaveURL('/');

    // メイン見出しが表示されることを確認
    await expect(page.getByRole('heading', { name: 'Codec Converter' })).toBeVisible();
  });

  test('should display header with accessible navigation', async ({ page }) => {
    await page.goto('/');

    // HeaderがセマンティックHTMLを使用していることを確認
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // アプリ名がアクセシブルな属性を持つリンクであることを確認
    // Note: .first() is used because the app name might appear in multiple locations
    const appName = page.getByRole('link', { name: /Codec Converter/i }).first();
    await expect(appName).toHaveAttribute('href', '/');

    // リンクがキーボードアクセス可能であることを確認（フォーカス可能）
    await appName.focus();
    await expect(appName).toBeFocused();
  });

  test('should display footer with version and accessibility', async ({ page }) => {
    await page.goto('/');

    // FooterがセマンティックHTMLを使用していることを確認
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // バージョンテキストがセマンティックバージョニングのパターンに従っていることを確認
    // Note: Footer displays "v1.0.0 | プライバシーポリシー | 利用規約" in a single Typography component
    const version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();

    const versionText = await version.textContent();
    // バージョンテキストにセマンティックバージョニングのパターンが含まれることを確認
    expect(versionText).toMatch(/v\d+\.\d+\.\d+/);
  });
});
