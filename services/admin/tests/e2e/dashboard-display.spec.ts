import { test, expect } from '@playwright/test';
import { setMockJWT, DEFAULT_TEST_USER, USER_MANAGER_TEST_USER, MULTI_ROLE_TEST_USER } from './helpers/mock-auth';

/**
 * ダッシュボード表示テスト
 *
 * 認証済みユーザーがダッシュボードにアクセスした際、
 * ユーザー情報と認証ステータスが正しく表示されることを確認します。
 */
test.describe('Dashboard Display', () => {
  test.beforeEach(async ({ page }) => {
    // 認証済み状態にする
    await setMockJWT(page);
    await page.goto('/dashboard');
  });

  test('should display user info on dashboard', async ({ page }) => {
    // ユーザー情報カードが表示されることを確認
    await expect(page.getByRole('heading', { name: 'ユーザー情報' })).toBeVisible();

    // メールアドレスが表示されることを確認
    await expect(page.getByText('メールアドレス:')).toBeVisible();
    await expect(page.getByText(DEFAULT_TEST_USER.email)).toBeVisible();

    // ロールが表示されることを確認
    await expect(page.getByText('ロール:')).toBeVisible();
    await expect(page.getByText('admin')).toBeVisible();

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

  test('should display correct user info for different users', async ({ page }) => {
    // 異なるユーザーでログイン
    await setMockJWT(page, USER_MANAGER_TEST_USER);
    await page.goto('/dashboard');

    // ユーザー情報が正しく表示されることを確認
    await expect(page.getByText(USER_MANAGER_TEST_USER.email)).toBeVisible();
    await expect(page.getByText('user-manager')).toBeVisible();
  });

  test('should display multiple roles for multi-role user', async ({ page }) => {
    // 複数ロールを持つユーザーでログイン
    await setMockJWT(page, MULTI_ROLE_TEST_USER);
    await page.goto('/dashboard');

    // すべてのロールが表示されることを確認
    for (const role of MULTI_ROLE_TEST_USER.roles) {
      await expect(page.getByText(role)).toBeVisible();
    }
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
