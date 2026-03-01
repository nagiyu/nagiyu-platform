import { test, expect } from '@playwright/test';

test.describe('サマリー画面スモークテスト', () => {
  test('サマリーページの基本要素が表示される', async ({ page }) => {
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    await expect(page.getByLabel('取引所')).toBeVisible();
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

  test('stock-admin の場合にサマリー更新ボタンが表示される', async ({ page }) => {
    await page.goto('/summaries');
    const isAdmin = process.env.TEST_USER_ROLES?.includes('stock-admin');
    if (isAdmin) {
      await expect(page.getByRole('button', { name: 'サマリー更新' })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'サマリー更新' })).toHaveCount(0);
    }
  });

  test('データ未投入環境ではサマリー行が0件でもページ表示できる', async ({ page }) => {
    await page.goto('/summaries');
    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();

    const rowCount = await page.locator('tbody tr').count();
    test.skip(rowCount > 0, 'サマリーデータがある環境のためスキップ');
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('行クリックでダイアログ表示できる（サマリーデータ存在時）', async ({ page }) => {
    await page.goto('/summaries');
    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();

    const firstRow = page.locator('tbody tr').first();
    const rowCount = await page.locator('tbody tr').count();
    test.skip(rowCount === 0, 'サマリーデータがない環境のためスキップ');

    await firstRow.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '閉じる' }).click();

    await expect(dialog).not.toBeVisible();
  });
});
