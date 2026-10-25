import { expect, test } from '@playwright/test';

/**
 * サインアウト確認画面の E2E。
 *
 * 全サービスのログアウトは auth の /api/auth/signout に着地し、そこから確認画面へ遷移する。
 * next-auth 既定の英語画面が出ていないこと、日本語の確認画面が出ることを確かめる。
 * 実際のサインアウト (POST 後のセッション破棄) は Google 認証が要るためここでは扱わない。
 */
test.describe('サインアウト確認画面', () => {
  test('日本語の確認画面を表示し、既定の英語画面を出さない', async ({ page }) => {
    await page.goto('/auth/signout');

    await expect(page.getByRole('heading', { level: 1, name: 'サインアウト' })).toBeVisible();
    await expect(page.getByText('サインアウトしますか?')).toBeVisible();
    await expect(page.getByRole('link', { name: 'キャンセル' })).toBeVisible();
    await expect(page.getByText('Are you sure you want to sign out?')).toHaveCount(0);
  });

  test('CSRF トークンの取得後にサインアウトボタンが有効になる', async ({ page }) => {
    await page.goto('/auth/signout');

    await expect(page.getByRole('button', { name: 'サインアウト' })).toBeEnabled();
    await expect(
      page.locator('form[action="/api/auth/signout"] input[name="csrfToken"]')
    ).not.toHaveValue('');
  });

  test('キャンセルの戻り先は Cookie が無ければ /dashboard になる', async ({ page }) => {
    await page.goto('/auth/signout');

    await expect(page.getByRole('link', { name: 'キャンセル' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  test('キャンセルの戻り先は callbackUrl Cookie の検証済みの値になる', async ({
    page,
    context,
  }) => {
    // 本番と同じ名前の Cookie を、ローカルでも受け付けられるよう Secure で与える
    await context.addCookies([
      {
        name: '__Secure-authjs.callback-url',
        value: 'https://admin.nagiyu.com/',
        domain: 'localhost',
        path: '/',
        secure: true,
      },
    ]);

    await page.goto('/auth/signout');

    await expect(page.getByRole('link', { name: 'キャンセル' })).toHaveAttribute(
      'href',
      'https://admin.nagiyu.com/'
    );
  });

  test('許可されない callbackUrl Cookie は無視して /dashboard にする', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: '__Secure-authjs.callback-url',
        value: 'https://evil.example.com/',
        domain: 'localhost',
        path: '/',
        secure: true,
      },
    ]);

    await page.goto('/auth/signout');

    await expect(page.getByRole('link', { name: 'キャンセル' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  test('/api/auth/signout へのアクセスは日本語の確認画面に遷移する', async ({ page }) => {
    await page.goto('/api/auth/signout?callbackUrl=https%3A%2F%2Fadmin.nagiyu.com%2F');

    await expect(page).toHaveURL(/\/auth\/signout$/);
    await expect(page.getByRole('heading', { level: 1, name: 'サインアウト' })).toBeVisible();
  });
});
