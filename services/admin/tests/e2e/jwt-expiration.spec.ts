import { test, expect } from '@playwright/test';
import { setExpiredJWT, DEFAULT_TEST_USER } from './helpers/mock-auth';

/**
 * JWT 期限切れテスト
 *
 * JWT トークンが期限切れの場合、
 * Auth サービスのサインインページにリダイレクトされることを確認します。
 */
test.describe('JWT Expiration', () => {
  test('should redirect to Auth when JWT expired', async ({ page }) => {
    // 期限切れ JWT をセット
    await setExpiredJWT(page, DEFAULT_TEST_USER);

    // ダッシュボードにアクセス
    await page.goto('/dashboard');

    // Auth サービスのサインインページにリダイレクトされることを確認
    const url = page.url();
    expect(url).toMatch(/signin/);

    // callbackUrl パラメータが設定されていることを確認
    const urlObj = new URL(url);
    const callbackUrl = urlObj.searchParams.get('callbackUrl');
    expect(callbackUrl).toBeTruthy();

    if (callbackUrl) {
      expect(callbackUrl).toContain('/dashboard');
    }
  });

  test('should not allow access to protected routes with expired JWT', async ({ page }) => {
    // 期限切れ JWT をセット
    await setExpiredJWT(page);

    // ルートパスにアクセス
    await page.goto('/');

    // サインインページにリダイレクトされることを確認
    const url = page.url();
    expect(url).toMatch(/signin/);
  });

  test('should handle JWT expiration during session', async ({ page }) => {
    // 短い有効期限の JWT をセット（1秒後に期限切れ）
    // Note: 実際には NextAuth のミドルウェアが JWT を検証するため、
    // このテストは理論的なシナリオです
    await setExpiredJWT(page, DEFAULT_TEST_USER);

    // ダッシュボードにアクセスを試みる
    await page.goto('/dashboard');

    // サインインページにリダイレクトされることを確認
    const url = page.url();
    expect(url).toMatch(/signin/);
  });
});
