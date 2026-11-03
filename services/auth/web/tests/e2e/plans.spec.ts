import { expect, test } from '@playwright/test';

test.describe('プランの画面', () => {
  // E2E では Stripe の鍵を入れないため、課金は無効として扱われる
  test('ログインなしで開け、課金が無効なら準備中と表示する', async ({ page }) => {
    const response = await page.goto('/plans');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'プラン' })).toBeVisible();
    await expect(page.getByText('準備中です')).toBeVisible();
    await expect(page.getByRole('button', { name: '申し込む' })).toHaveCount(0);
  });
});
