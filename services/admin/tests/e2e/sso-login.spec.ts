import { test, expect } from '@playwright/test';
import { setMockJWT, mockGoogleOAuthLogin, DEFAULT_TEST_USER } from './helpers/mock-auth';
import { MULTI_ROLE_TEST_USER } from './helpers/jwt-utils';

/**
 * SSO ログインテスト
 *
 * Auth サービスでログインした後、
 * Admin サービスに正しくリダイレクトされることを確認します。
 */
test.describe('SSO Login', () => {
  test('should redirect back to Admin after Auth login', async ({ page, context }) => {
    // Auth サービスでログイン（モック）
    await mockGoogleOAuthLogin(page, context);

    // Admin サービスのダッシュボードにアクセス
    await page.goto('/dashboard');

    // ダッシュボードが表示されることを確認
    await expect(page).toHaveURL(/\/dashboard/);

    // ユーザー情報が表示されることを確認
    await expect(page.getByText(DEFAULT_TEST_USER.email)).toBeVisible();
  });

  test('should maintain session across page reloads', async ({ page }) => {
    // 認証済み状態にする
    await setMockJWT(page);
    await page.goto('/dashboard');

    // ダッシュボードが表示されることを確認
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();

    // ページをリロード
    await page.reload();

    // セッションが維持され、ダッシュボードが再表示されることを確認
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();
    await expect(page.getByText(DEFAULT_TEST_USER.email)).toBeVisible();
  });

  test('should allow navigation between pages with valid session', async ({ page }) => {
    // 認証済み状態にする
    await setMockJWT(page);

    // ダッシュボードにアクセス
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();

    // ルートパスに移動（認証が必要なルート）
    await page.goto('/');

    // リダイレクトされずにアクセスできることを確認
    // （もし / が認証不要なら、このテストは調整が必要）
    const url = page.url();
    expect(url).not.toMatch(/signin/);
  });

  test('should preserve user roles after login', async ({ page }) => {
    // 複数ロールを持つユーザーでログイン
    await setMockJWT(page, MULTI_ROLE_TEST_USER);
    await page.goto('/dashboard');

    // ダッシュボードが表示されることを確認
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();

    // 両方のロールが表示されることを確認
    for (const role of MULTI_ROLE_TEST_USER.roles) {
      await expect(page.getByText(role)).toBeVisible();
    }
  });
});
