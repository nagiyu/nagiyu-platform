import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('QuickClip Top Page', () => {
  test('トップページの基本要素を表示する', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'QuickClip' })).toBeVisible();
    await expect(page.getByText('動画をアップロードして見どころ抽出を開始します。')).toBeVisible();
    await expect(page.getByRole('button', { name: 'アップロードして処理開始' })).toBeDisabled();
  });

  test('動画アップロード後に処理中画面へ遷移する', async ({ page }) => {
    await page.goto('/');
    await page.route('**/api/jobs', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'e2e-job-id',
          status: 'PENDING',
          uploadUrl: 'https://example.com/upload',
          expiresIn: 3600,
        }),
      });
    });
    await page.route('https://example.com/upload', async (route) => {
      await route.fulfill({
        status: 200,
        body: '',
      });
    });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sample.mp4'));

    await Promise.all([
      page.waitForURL(/\/jobs\//),
      page.getByRole('button', { name: 'アップロードして処理開始' }).click(),
    ]);

    await expect(page.getByRole('heading', { level: 1, name: '処理中画面' })).toBeVisible();
  });
});
