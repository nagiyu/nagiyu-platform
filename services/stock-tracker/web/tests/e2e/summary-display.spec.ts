import { test, expect } from '@playwright/test';

test.describe('サマリー画面スモークテスト', () => {
  test('仮データでサマリーページが表示される', async ({ page }) => {
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    await expect(page.getByText('NASDAQ')).toBeVisible();
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '終値' }).first()).toBeVisible();
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

  test('ティッカー行をクリックするとダイアログが表示される', async ({ page }) => {
    await page.goto('/summaries');

    await page.getByRole('row', { name: /AAPL/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('AAPL')).toBeVisible();
    await expect(dialog.getByText('Apple Inc.')).toBeVisible();
  });

  test('ダイアログの閉じるボタンでダイアログが閉じる', async ({ page }) => {
    await page.goto('/summaries');

    await page.getByRole('row', { name: /AAPL/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '閉じる' }).click();

    await expect(dialog).not.toBeVisible();
  });
});
