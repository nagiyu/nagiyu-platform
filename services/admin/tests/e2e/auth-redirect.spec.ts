import { test, expect } from '@playwright/test';
import { clearAuthCookies } from './helpers/mock-auth';

/**
 * 未認証アクセス → Auth サービスへリダイレクトのテスト
 *
 * Admin サービスに未認証でアクセスした際、
 * Auth サービスのサインインページにリダイレクトされることを確認します。
 */
test.describe('Auth Redirect - Unauthenticated Access', () => {
  test.beforeEach(async ({ page }) => {
    // 認証クッキーがない状態を保証
    await clearAuthCookies(page);
  });

  test('should redirect to Auth service when not authenticated', async ({ page }) => {
    // Admin サービスのダッシュボードにアクセス
    await page.goto('/dashboard');

    // Auth サービスのサインインページにリダイレクトされることを期待
    // Note: 実際には Auth サービスが動作していないため、
    // リダイレクト先の URL が正しいことのみ確認
    const url = page.url();

    // NEXT_PUBLIC_AUTH_URL または NEXTAUTH_URL で設定された Auth サービスの URL を確認
    // ローカル環境では環境変数が未設定の可能性があるため、柔軟にチェック
    expect(url).toMatch(/signin/);

    // callbackUrl パラメータが設定されていることを確認
    const urlObj = new URL(url);
    const callbackUrl = urlObj.searchParams.get('callbackUrl');
    expect(callbackUrl).toBeTruthy();

    // callbackUrl に元のパス（/dashboard）が含まれることを確認
    if (callbackUrl) {
      expect(callbackUrl).toContain('/dashboard');
    }
  });

  test('should preserve query parameters in callbackUrl', async ({ page }) => {
    // クエリパラメータ付きで Admin サービスにアクセス
    await page.goto('/dashboard?tab=users&filter=active');

    const url = page.url();
    expect(url).toMatch(/signin/);

    const urlObj = new URL(url);
    const callbackUrl = urlObj.searchParams.get('callbackUrl');
    expect(callbackUrl).toBeTruthy();

    // callbackUrl に元のクエリパラメータが含まれることを確認
    if (callbackUrl) {
      expect(callbackUrl).toContain('/dashboard');
      expect(callbackUrl).toContain('tab=users');
      expect(callbackUrl).toContain('filter=active');
    }
  });

  test('should redirect from root path when not authenticated', async ({ page }) => {
    // ルートパスにアクセス
    await page.goto('/');

    const url = page.url();

    // サインインページにリダイレクトされることを確認
    expect(url).toMatch(/signin/);

    const urlObj = new URL(url);
    const callbackUrl = urlObj.searchParams.get('callbackUrl');
    expect(callbackUrl).toBeTruthy();
  });

  test('should allow access to health check endpoint without authentication', async ({ page }) => {
    // ヘルスチェックエンドポイントは認証不要
    const response = await page.goto('/api/health');

    // 200 OK レスポンスを期待
    expect(response?.status()).toBe(200);

    // JSON レスポンスを確認
    const body = await response?.json();
    expect(body).toHaveProperty('status', 'ok');
  });
});
