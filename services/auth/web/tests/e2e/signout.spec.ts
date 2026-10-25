import { expect, test } from '@playwright/test';

/**
 * サインアウト確認画面の E2E。
 *
 * 全サービスのログアウトは auth の /api/auth/signout に着地し、そこから確認画面へ遷移する。
 * next-auth 既定の英語画面が出ていないこと、日本語の確認画面が出ること、
 * 確認画面から next-auth の POST が実際に送られることを確かめる。
 * セッション破棄そのもの (Google 認証が要る) は扱わない。
 *
 * ローカルの E2E 環境では next-auth の Cookie (`__Secure-` / `__Host-` 接頭辞) が保存されない。
 * 接頭辞付き Cookie は Secure 属性が必須だが、ローカルは http かつ開発設定 (secure: false)、
 * `next start` 時は Cookie の domain が `.nagiyu.com` で localhost と一致せず、ブラウザが拒否する。
 * そのため callbackUrl Cookie を介した戻り先や、サインアウト後の着地先はブラウザ・起動方法で
 * 変わりうる。着地先の厳密な検証は戻り先解決のユニットテストに委ね、ここでは全ブラウザで
 * 成り立つ観点 (画面・form の中身・next-auth の応答が 302 であること) に絞る。
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

  test('/api/auth/signout へのアクセスは日本語の確認画面に遷移する', async ({ page }) => {
    await page.goto('/api/auth/signout?callbackUrl=https%3A%2F%2Fadmin.nagiyu.com%2F');

    await expect(page).toHaveURL(/\/auth\/signout$/);
    await expect(page.getByRole('heading', { level: 1, name: 'サインアウト' })).toBeVisible();
  });

  test('「サインアウト」で CSRF トークン付きの POST が送られ、next-auth が 302 で応答する', async ({
    page,
  }) => {
    await page.goto('/api/auth/signout?callbackUrl=https%3A%2F%2Fadmin.nagiyu.com%2F');
    await expect(page.getByRole('button', { name: 'サインアウト' })).toBeEnabled();

    const isSignOutPost = (request: { method(): string; url(): string }) =>
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/signout';
    const [request, response] = await Promise.all([
      page.waitForRequest(isSignOutPost),
      page.waitForResponse((res) => isSignOutPost(res.request())),
      page.getByRole('button', { name: 'サインアウト' }).click(),
    ]);

    // callbackUrl は form に載せず next-auth の Cookie に任せるため、body は csrfToken だけになる
    const body = new URLSearchParams(request.postData() ?? '');
    expect(body.get('csrfToken')).toBeTruthy();
    expect(body.has('callbackUrl')).toBe(false);

    expect(response.status()).toBe(302);
    const location = await response.headerValue('location');
    expect(location).toBeTruthy();
    expect(location).not.toContain('/api/auth/signout');

    // 着地先は上記の Cookie 事情で変わるため、確認画面から離れたことだけを確かめる
    await expect(page).not.toHaveURL(/\/auth\/signout$/);
  });

  test('「キャンセル」で確認画面から離れ、戻り先 (Cookie が無ければ /dashboard) に遷移する', async ({
    page,
  }) => {
    await page.goto('/auth/signout');

    const cancel = page.getByRole('link', { name: 'キャンセル' });
    await expect(cancel).toHaveAttribute('href', '/dashboard');
    await cancel.click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
