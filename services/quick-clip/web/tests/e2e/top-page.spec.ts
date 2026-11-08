import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('QuickClip Top Page', () => {
  test('トップページの基本要素を表示する', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'さくっとクリップ' })).toBeVisible();
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

    await expect(page.getByRole('heading', { level: 1, name: '処理状況' })).toBeVisible();
  });

  test('アップロード中にページを閉じようとすると離脱確認が出る', async ({ page }) => {
    await page.goto('/');
    let releaseJobResponse: () => void = () => {};
    const jobResponseGate = new Promise<void>((resolve) => {
      releaseJobResponse = resolve;
    });
    await page.route('**/api/jobs', async (route) => {
      await jobResponseGate;
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

    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, '../fixtures/sample.mp4'));
    await page.getByRole('button', { name: 'アップロードして処理開始' }).click();
    // 送信状態に入ったことを待ってから閉じる。入る前だと警告が未登録で判定が揺れる
    await expect(page.getByText(/アップロード中\.\.\./).first()).toBeVisible();

    const dialogPromise = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    releaseJobResponse();
  });

  test('送信前はページを閉じても離脱確認が出ない', async ({ page }) => {
    await page.goto('/');
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, '../fixtures/sample.mp4'));

    let dialogShown = false;
    page.on('dialog', () => {
      dialogShown = true;
    });
    await page.close({ runBeforeUnload: true });

    expect(dialogShown).toBe(false);
  });
});
