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

test.describe('特定商取引法に基づく表記', () => {
  test('ログインなしで開け、見出しと開示の文言を表示する', async ({ page }) => {
    const response = await page.goto('/legal/tokushoho');

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: '特定商取引法に基づく表記' })
    ).toBeVisible();
    await expect(page.getByText('請求があれば遅滞なく開示いたします').first()).toBeVisible();
  });

  test('プランの画面から表記へ移れる', async ({ page }) => {
    await page.goto('/plans');
    await page.getByRole('link', { name: '特定商取引法に基づく表記' }).first().click();

    await expect(page).toHaveURL(/\/legal\/tokushoho$/);
  });
});
