import { test, expect } from '@playwright/test';

/**
 * ダッシュボード表示テスト
 *
 * 認証済みユーザーがダッシュボードにアクセスした際、
 * ユーザー情報と認証ステータスが正しく表示されることを確認します。
 *
 * Note: SKIP_AUTH_CHECK=true の環境で実行するため、
 * TEST_USER_EMAIL と TEST_USER_ROLES の環境変数を使用します。
 */
test.describe('Dashboard Display', () => {
  const testUserEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
  const testUserRoles = process.env.TEST_USER_ROLES?.split(',') || ['admin'];

  test.beforeEach(async ({ page }) => {
    // SKIP_AUTH_CHECK=true の環境では認証チェックがスキップされるため、
    // 直接ダッシュボードにアクセス可能
    await page.goto('/dashboard');
  });

  test('should display user info on dashboard', async ({ page }) => {
    // ユーザー情報カードが表示されることを確認
    await expect(page.getByRole('heading', { name: 'ユーザー情報' })).toBeVisible();

    // メールアドレスが表示されることを確認
    await expect(page.getByText('メールアドレス:')).toBeVisible();
    await expect(page.getByText(testUserEmail)).toBeVisible();

    // ロールが表示されることを確認
    await expect(page.getByText('ロール:')).toBeVisible();
    for (const role of testUserRoles) {
      // MuiChip 要素内のロールを確認（ヘッダーの "Admin" と区別するため）
      await expect(page.locator('.MuiChip-label').getByText(role, { exact: true })).toBeVisible();
    }

    // 認証ステータスが表示されることを確認
    await expect(
      page.getByText('✓ Auth サービスとの SSO 連携が正常に動作しています')
    ).toBeVisible();
  });

  test('should display authentication status card', async ({ page }) => {
    // 認証ステータスカードが表示されることを確認
    await expect(page.getByRole('heading', { name: '認証ステータス' })).toBeVisible();

    // SSO 連携メッセージが表示されることを確認
    await expect(
      page.getByText('✓ Auth サービスとの SSO 連携が正常に動作しています')
    ).toBeVisible();

    // JWT トークンメッセージが表示されることを確認
    await expect(page.getByText('JWT トークンによる認証が有効です')).toBeVisible();
  });

  test('should display logout button', async ({ page }) => {
    // ログアウトボタンが表示されることを確認
    const logoutButton = page.getByRole('link', { name: 'ログアウト' });
    await expect(logoutButton).toBeVisible();

    // ログアウトボタンのリンク先を確認
    const href = await logoutButton.getAttribute('href');
    expect(href).toContain('/api/auth/signout');
  });

  test('should display header with Admin title', async ({ page }) => {
    // ヘッダーに Admin タイトルが表示されることを確認
    await expect(page.getByRole('link', { name: /Admin/ })).toBeVisible();
  });

  test('should display footer with version info', async ({ page }) => {
    // フッターにバージョン情報が表示されることを確認
    await expect(page.getByText(/v\d+\.\d+\.\d+/)).toBeVisible();
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // モバイルビューポートに変更
    await page.setViewportSize({ width: 375, height: 667 });

    // 主要な要素がモバイルでも表示されることを確認
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ユーザー情報' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '認証ステータス' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ログアウト' })).toBeVisible();
  });

  test('should be responsive on PC viewport', async ({ page }) => {
    // PC ビューポートに変更
    await page.setViewportSize({ width: 1280, height: 720 });

    // 主要な要素が PC でも表示されることを確認
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ユーザー情報' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '認証ステータス' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ログアウト' })).toBeVisible();
  });
});
