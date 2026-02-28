import { test, expect } from '@playwright/test';

test.describe('サマリー画面スモークテスト', () => {
  test('データあり表示: サマリーの詳細が正しく表示される', async ({ page }) => {
    await page.goto('/summaries');

    const aaplRow = page
      .locator('tbody tr')
      .filter({ has: page.getByRole('cell', { name: 'AAPL' }) })
      .first();

    await expect(aaplRow.getByRole('cell', { name: 'Apple Inc.' })).toBeVisible();
    await expect(aaplRow.getByRole('cell', { name: '182.15' })).toBeVisible();
    await expect(aaplRow.getByRole('cell', { name: '183.92' })).toBeVisible();
    await expect(aaplRow.getByRole('cell', { name: '181.44' })).toBeVisible();
    await expect(aaplRow.getByRole('cell', { name: '183.31' })).toBeVisible();
  });

  test('データなし空状態: 空状態メッセージが表示される', async ({ page }) => {
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: 'TSE' })).toBeVisible();
    await expect(page.getByText('最新更新: -')).toBeVisible();
    await expect(page.getByText('データがありません')).toBeVisible();
  });

  test('取引所グループ化: 取引所ごとにサマリーが表示される', async ({ page }) => {
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: 'NASDAQ' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'NYSE' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'TSE' })).toBeVisible();
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(page.getByText('JNJ')).toBeVisible();
    await expect.poll(async () => page.getByRole('table').count()).toBe(2);
  });

  test('仮データでサマリーページが表示される', async ({ page }) => {
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    await expect(page.getByText('NASDAQ')).toBeVisible();
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(
      page.getByText(/最新更新:\s*\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}/).first()
    ).toBeVisible();
    await expect(page.getByText('最新更新: -')).toBeVisible();
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
