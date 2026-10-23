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
