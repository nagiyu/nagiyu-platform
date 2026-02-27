import { test, expect } from '@playwright/test';

test.describe('サマリー画面スモークテスト', () => {
  test('仮データでサマリーページが表示される', async ({ page }) => {
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    await expect(page.getByText('NASDAQ')).toBeVisible();
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '終値' })).toBeVisible();
    await expect.poll(async () => page.locator('tbody tr').count()).toBeGreaterThanOrEqual(1);
  });

  test('ナビゲーションリンクからサマリーページに遷移できる', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'メニューを開く' }).click();

    const summaryLink = page.getByRole('dialog').getByRole('link', { name: 'サマリー' });
    await expect(summaryLink).toBeVisible();
    await summaryLink.click();

    await expect(page).toHaveURL('/summaries');
    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
  });
});
