/**
 * Codec Converter - E2E Test: Scenario 2 (File Size Validation)
 *
 * シナリオ2: エラーハンドリング（ファイルサイズ超過）
 * 1. 600MBのMP4ファイルを選択
 * 2. エラーメッセージ「ファイルサイズは500MB以下である必要があります」が表示される
 * 3. アップロードが実行されない
 */

import { test, expect, createTestVideoFile } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test.describe('Scenario 2: File Size Validation Error', () => {
  let testFilePaths: string[] = [];

  // クリーンアップ用のフック
  test.afterEach(async () => {
    // テスト終了後に作成したファイルをクリーンアップ
    for (const filePath of testFilePaths) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.warn(`Failed to cleanup test file: ${filePath}`, error);
        }
      }
    }
    testFilePaths = [];
  });

  test('should show error message for files exceeding 500MB', async ({ page }) => {
    // ホームページに移動
    await page.goto('/');

    // ページタイトルを確認
    await expect(page.getByRole('heading', { name: 'Codec Converter' })).toBeVisible();

    // 600MBの大きなファイルを作成（一時ディレクトリに）
    const tmpDir = os.tmpdir();
    const testFilePath = path.join(tmpDir, 'large-test-video-600mb.mp4');
    const largeFileBuffer = createTestVideoFile(600); // 600MB
    fs.writeFileSync(testFilePath, largeFileBuffer);
    testFilePaths.push(testFilePath); // クリーンアップリストに追加

    try {
      // ファイルアップロード領域を見つける
      const fileInput = page.locator('input[type="file"]');

      // ファイルを選択
      await fileInput.setInputFiles(testFilePath);

      // エラーメッセージが表示されることを確認
      const errorAlert = page.getByRole('alert').filter({ hasText: 'ファイルサイズは500MB以下である必要があります' });
      await expect(errorAlert).toBeVisible({ timeout: 5000 });

      // 選択されたファイル情報が表示されないことを確認
      await expect(page.locator('text=選択されたファイル')).not.toBeVisible();

      // 変換開始ボタンが無効化されていることを確認
      const submitButton = page.getByRole('button', { name: '変換開始' });
      await expect(submitButton).toBeDisabled();
    } finally {
      // テストファイルをクリーンアップ（afterEachでも実行されるが念のため）
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  test('should accept files under 500MB', async ({ page }) => {
    // ホームページに移動
    await page.goto('/');

    // 50MBの有効なファイルを作成
    const tmpDir = os.tmpdir();
    const testFilePath = path.join(tmpDir, 'valid-test-video-50mb.mp4');
    const validFileBuffer = createTestVideoFile(50); // 50MB
    fs.writeFileSync(testFilePath, validFileBuffer);
    testFilePaths.push(testFilePath); // クリーンアップリストに追加

    try {
      // ファイルアップロード領域を見つける
      const fileInput = page.locator('input[type="file"]');

      // ファイルを選択
      await fileInput.setInputFiles(testFilePath);

      // エラーメッセージが表示されないことを確認
      await expect(page.getByRole('alert').filter({ hasText: 'ファイルサイズ' })).not.toBeVisible();

      // 選択されたファイル情報が表示されることを確認
      await expect(page.locator('text=選択されたファイル')).toBeVisible();
      await expect(page.locator('text=valid-test-video-50mb.mp4')).toBeVisible();

      // 変換開始ボタンが有効化されていることを確認
      const submitButton = page.getByRole('button', { name: '変換開始' });
      await expect(submitButton).toBeEnabled();
    } finally {
      // テストファイルをクリーンアップ（afterEachでも実行されるが念のため）
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  test('should validate file size on drag and drop', async ({ page }) => {
    // ホームページに移動
    await page.goto('/');

    // 600MBのファイルを作成
    const tmpDir = os.tmpdir();
    const testFilePath = path.join(tmpDir, 'drag-drop-test-video-600mb.mp4');
    const largeFileBuffer = createTestVideoFile(600); // 600MB
    fs.writeFileSync(testFilePath, largeFileBuffer);
    testFilePaths.push(testFilePath); // クリーンアップリストに追加

    try {
      // ドラッグ&ドロップ領域を見つける
      const dropZone = page.getByRole('button', {
        name: /ファイルをドラッグ&ドロップ/,
      });
      await expect(dropZone).toBeVisible();

      // ファイルをドラッグ&ドロップ
      // Note: Playwright doesn't support real drag-and-drop file upload
      // We simulate it by setting the file input directly
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testFilePath);

      // エラーメッセージが表示されることを確認
      const errorAlert = page.getByRole('alert').filter({ hasText: 'ファイルサイズは500MB以下である必要があります' });
      await expect(errorAlert).toBeVisible({ timeout: 5000 });
    } finally {
      // テストファイルをクリーンアップ（afterEachでも実行されるが念のため）
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });
});
