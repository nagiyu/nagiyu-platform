import { test, expect } from '@playwright/test';

test.describe('Auth Service', () => {
  test('サインインページが表示される', async ({ page }) => {
    await page.goto('/signin');

    await expect(page.getByRole('heading', { name: 'Auth サービス' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Google でサインイン/i })).toBeVisible();
  });

  test('未認証でダッシュボードにアクセスするとサインインページにリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/signin/);
    await expect(page.getByRole('heading', { name: 'Auth サービス' })).toBeVisible();
  });

  test('エラーページが表示される', async ({ page }) => {
    await page.goto('/auth/error?error=Configuration');

    await expect(page.getByRole('heading', { name: '認証エラー' })).toBeVisible();
    await expect(page.getByText(/サーバー設定に問題があります/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'サインインページへ戻る' })).toBeVisible();
  });

  test('ヘルスチェックAPIが正常に動作する', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });
});
