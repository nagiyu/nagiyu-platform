import { test, expect } from '@playwright/test';

test.describe('認証ミドルウェア', () => {
  test('公開ルート /api/health は認証なしでアクセス可能', async ({ page }) => {
    const response = await page.goto('/api/health');

    expect(response?.status()).toBe(200);

    const data = await response?.json();
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('version');
  });

  test('未認証時に / にアクセスすると Auth サービスへリダイレクトされる', async ({
    page,
    context,
  }) => {
    // クッキーをクリア
    await context.clearCookies();

    // ホームページにアクセス
    await page.goto('/');

    // Auth サービスのサインインページにリダイレクトされることを確認
    await page.waitForURL(/signin/, { timeout: 10000 });

    const currentUrl = new URL(page.url());

    // Auth サービスの URL にリダイレクトされていることを確認
    expect(currentUrl.pathname).toContain('signin');

    // callbackUrl パラメータが設定されていることを確認
    const callbackUrl = currentUrl.searchParams.get('callbackUrl');
    expect(callbackUrl).toBeTruthy();
    expect(callbackUrl).toContain('/');
  });

  test('未認証時にダッシュボードにアクセスすると Auth サービスへリダイレクトされる', async ({
    page,
    context,
  }) => {
    // クッキーをクリア
    await context.clearCookies();

    // ダッシュボードにアクセス
    // Note: 現時点では /dashboard ページ自体は存在しないが、
    // 認証ミドルウェアが「保護対象の任意のアプリケーションルート」に対して
    // 正しくリダイレクトを行うことを確認するため、あえて存在しないパスを使用している
    await page.goto('/dashboard');

    // Auth サービスのサインインページにリダイレクトされることを確認
    await page.waitForURL(/signin/, { timeout: 10000 });

    const currentUrl = new URL(page.url());

    // callbackUrl にダッシュボードの URL が設定されていることを確認
    const callbackUrl = currentUrl.searchParams.get('callbackUrl');
    expect(callbackUrl).toBeTruthy();
    expect(callbackUrl).toContain('/dashboard');
  });

  test('静的ファイルは認証をスキップする', async ({ page }) => {
    // favicon.ico は認証をスキップする（matcher で除外されている）
    const response = await page.goto('/favicon.ico');

    // 404 または 200 が返れば OK（リダイレクトされていないことを確認）
    expect([200, 404]).toContain(response?.status() || 0);
  });
});

test.describe('認証済みアクセス', () => {
  test.skip('有効な JWT クッキーがある場合、ホームページにアクセスできる', async ({
    page,
    context,
  }) => {
    // Note: このテストは Auth サービスとの統合が必要なため、
    // 実際の環境では Auth サービスから取得した JWT を使用してください
    // 現在は skip としています
    // 実装例:
    // const validJwt = await getValidJwtFromAuthService();
    // await context.addCookies([
    //   {
    //     name: '__Secure-next-auth.session-token',
    //     value: validJwt,
    //     domain: 'localhost',
    //     path: '/',
    //     httpOnly: true,
    //     secure: true,
    //   },
    // ]);
    //
    // await page.goto('/');
    // await expect(page).toHaveTitle(/Admin/);
  });
});
