import { test, expect } from '@playwright/test';
import { setMockJWT, clearAuthCookies } from './helpers/mock-auth';

/**
 * ログアウトテスト
 *
 * ログアウトボタンをクリックした際、
 * Auth サービスのログアウトエンドポイントに遷移することを確認します。
 */
test.describe('Logout', () => {
  test.beforeEach(async ({ page }) => {
    // 認証済み状態にする
    await setMockJWT(page);
    await page.goto('/dashboard');
  });

  test('should redirect to Auth signout endpoint when logout button is clicked', async ({
    page,
  }) => {
    // ログアウトボタンを取得
    const logoutButton = page.getByRole('link', { name: 'ログアウト' });
    await expect(logoutButton).toBeVisible();

    // ログアウトボタンのリンク先を確認
    const href = await logoutButton.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toContain('/api/auth/signout');

    // ログアウトボタンをクリック
    await logoutButton.click();

    // Auth サービスのログアウトエンドポイントに遷移することを確認
    // Note: 実際には Auth サービスが動作していないため、
    // リダイレクト先の URL が正しいことのみ確認
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).toContain('/api/auth/signout');
  });

  test('should clear authentication cookies after logout', async ({ page }) => {
    // ログアウトを実行（手動でクッキーをクリア）
    await clearAuthCookies(page);

    // ダッシュボードにアクセスを試みる
    await page.goto('/dashboard');

    // サインインページにリダイレクトされることを確認
    const url = page.url();
    expect(url).toMatch(/signin/);
  });

  test('should require re-authentication after logout', async ({ page }) => {
    // ログアウト（クッキーをクリア）
    await clearAuthCookies(page);

    // ルートパスにアクセス
    await page.goto('/');

    // サインインページにリダイレクトされることを確認
    const url = page.url();
    expect(url).toMatch(/signin/);

    // 再度ログイン（JWT をセット）
    await setMockJWT(page);
    await page.goto('/dashboard');

    // ダッシュボードにアクセスできることを確認
    await expect(page.getByRole('heading', { name: 'ダッシュボード', level: 1 })).toBeVisible();
  });
});
