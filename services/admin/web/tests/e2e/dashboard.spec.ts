import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should display the dashboard page', async ({ page }) => {
    await page.goto('/dashboard');

    // Check the page title
    await expect(page).toHaveTitle(/Admin Dashboard/);

    // Check the main heading
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();
  });

  test('should display user information card', async ({ page }) => {
    await page.goto('/dashboard');

    // Check user information card heading
    await expect(page.getByRole('heading', { name: 'ユーザー情報' })).toBeVisible();

    // Check email is displayed (verify format, not specific value)
    await expect(page.getByText('メールアドレス:')).toBeVisible();
    await expect(page.getByText(/.+@.+\..+/)).toBeVisible();

    // Check roles heading
    await expect(page.getByText('ロール:')).toBeVisible();

    // Check role chips are displayed (at least one chip should be visible)
    const roleChips = page.locator('[class*="MuiChip"]');
    await expect(roleChips.first()).toBeVisible();
  });

  test('should display authentication status card', async ({ page }) => {
    await page.goto('/dashboard');

    // Check authentication status card heading
    await expect(page.getByRole('heading', { name: '認証ステータス' })).toBeVisible();

    // Check SSO message
    await expect(
      page.getByText('✓ Auth サービスとの SSO 連携が正常に動作しています')
    ).toBeVisible();

    // Check JWT message
    await expect(page.getByText('JWT トークンによる認証が有効です')).toBeVisible();
  });

  test('should display logout button', async ({ page }) => {
    await page.goto('/dashboard');

    // Check logout button is displayed
    const logoutButton = page.getByRole('link', { name: 'ログアウト' });
    await expect(logoutButton).toBeVisible();
  });

  test('should display Header with Admin title', async ({ page }) => {
    await page.goto('/dashboard');

    // Check Header title
    await expect(page.getByRole('link', { name: /Admin/ })).toBeVisible();
  });

  test('should display Footer with version info', async ({ page }) => {
    await page.goto('/dashboard');

    // Check Footer version (it should display version number)
    await expect(page.getByText(/v\d+\.\d+\.\d+/)).toBeVisible();
  });

  test('should be responsive on mobile viewport (375px)', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');

    // Check main elements are visible on mobile
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ユーザー情報' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '認証ステータス' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ログアウト' })).toBeVisible();
  });

  test('should be responsive on PC viewport (1280px)', async ({ page }) => {
    // Set PC viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/dashboard');

    // Check main elements are visible on PC
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ユーザー情報' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '認証ステータス' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ログアウト' })).toBeVisible();
  });
});
