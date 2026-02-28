import { test, expect } from '@playwright/test';

test.describe('サマリー画面スモークテスト', () => {
  test('サマリーページの基本要素が表示される', async ({ page }) => {
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '対象日' })).toBeVisible();
  });

  test('不正な日付クエリでエラーメッセージが表示される', async ({ page }) => {
    await page.goto('/summaries?date=2024-13-40');
    await expect(page.getByText('日付はYYYY-MM-DD形式で指定してください')).toBeVisible();
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

  test('日付クエリ指定時に日付フィルターへ初期反映される', async ({ page }) => {
    await page.goto('/summaries?date=2024-01-15');
    await expect(page.getByRole('textbox', { name: '対象日' })).toHaveValue('2024-01-15');
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
