import { test, expect } from '@playwright/test';

/**
 * Auth サービスの E2E。
 *
 * 未認証時のリダイレクト（未認証で /dashboard にアクセス → /signin）は、E2E 環境が
 * `SKIP_AUTH_CHECK=true` で起動するため未認証状態を作れず、以前は無条件 `test.skip` で
 * 封印されていた。testing.md「形骸化テストの禁止」に従い封印テストは削除し、担保は
 * `libs/nextjs/tests/unit/middleware.test.ts` の `createAuthMiddleware` の単体テストに
 * 委ねる（「未認証時に外部サインインURLへリダイレクトする」「ローカルサインインURLに
 * リダイレクトできる」「未認証の場合は permission チェックを経由せずサインインへ
 * リダイレクトする」の 3 ケースで担保済み）。
 * `src/middleware.ts` はこの `createAuthMiddleware` をそのまま利用している。
 */
test.describe('Auth Service', () => {
  test('サインインページが表示される', async ({ page }) => {
    await page.goto('/signin');

    await expect(page.getByRole('heading', { name: 'Auth サービス' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Google でサインイン/i })).toBeVisible();
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
