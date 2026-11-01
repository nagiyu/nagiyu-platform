import { expect, test } from '@playwright/test';

test.describe('存在しない URL', () => {
  test('日本語の 404 画面を表示し、Next.js 既定の英語画面を出さない', async ({ page }) => {
    const response = await page.goto('/no-such-page-4114');

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'ページが見つかりません' })
    ).toBeVisible();
    await expect(page.getByText('This page could not be found')).toHaveCount(0);
  });
});

test.describe('存在しない記事の URL (JavaScript 無効)', () => {
  // クライアントの JS が 404 画面を描き直すと、サーバーが中身の無い外枠を返す不具合を
  // 見逃すため、JS を止めてサーバーが返す HTML だけで確かめる。
  test.use({ javaScriptEnabled: false });

  test('サーバーが 404 画面を描く', async ({ page }) => {
    const response = await page.goto('/tech/no-such-article');

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'ページが見つかりません' })
    ).toBeVisible();
  });
});
