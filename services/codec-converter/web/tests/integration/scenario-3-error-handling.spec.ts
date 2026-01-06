/**
 * Codec Converter - E2E Test: Scenario 3 (FFmpeg Failure)
 *
 * シナリオ3: エラーハンドリング（FFmpeg失敗）
 * 1. FFmpegで処理できないコーデックのMP4をアップロード
 * 2. ジョブステータスが `FAILED` になる
 * 3. エラーメッセージが記録される
 *
 * Note: このテストは実際のAWS環境またはLocalStackが必要です
 * CI環境で実行する場合は、適切な環境変数を設定してください
 */

import { test, expect, createTestVideoFile, generateTestFileName, TEST_CONFIG } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test.describe('Scenario 3: FFmpeg Failure Handling', () => {
  // Skip this test if AWS credentials are not configured
  test.skip(
    !process.env.AWS_REGION || !process.env.BASE_URL,
    'Requires AWS environment to be configured'
  );

  test('should handle FFmpeg processing failure gracefully', async ({ page }) => {
    // ホームページに移動
    await page.goto('/');

    // 不正なMP4ファイルを作成（ヘッダーのみで実際の動画データなし）
    // FFmpegがこのファイルを処理しようとすると失敗する
    const tmpDir = os.tmpdir();
    const testFileName = generateTestFileName();
    const testFilePath = path.join(tmpDir, testFileName);

    // 最小限のMP4ファイル（実際の動画ストリームがないため、FFmpegは失敗する）
    const invalidFileBuffer = createTestVideoFile(1); // 1MB (minimal invalid MP4)
    fs.writeFileSync(testFilePath, invalidFileBuffer);

    try {
      // Step 1: ファイルをアップロード
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testFilePath);

      // ファイルが選択されたことを確認
      await expect(page.locator('text=選択されたファイル')).toBeVisible();

      // Step 2: 変換開始ボタンをクリック
      const submitButton = page.getByRole('button', { name: '変換開始' });
      await expect(submitButton).toBeEnabled();
      await submitButton.click();

      // Step 3: ジョブ詳細ページにリダイレクトされることを確認
      await page.waitForURL(/\/jobs\/[a-f0-9-]+/, { timeout: 30000 });

      // ジョブ詳細ページが表示されることを確認
      await expect(page.getByRole('heading', { name: '変換ジョブ詳細' })).toBeVisible();

      // Step 4: ステータス確認ボタンを定期的にクリックして、FAILEDステータスを待機
      test.setTimeout(180000); // 3分のタイムアウト

      const refreshButton = page.getByRole('button', { name: 'ステータス確認' });
      let attemptCount = 0;

      while (attemptCount < TEST_CONFIG.MAX_COMPLETION_POLL_ATTEMPTS) {
        // ステータス確認ボタンが表示されているか確認
        const isRefreshVisible = await refreshButton.isVisible().catch(() => false);

        if (isRefreshVisible) {
          await refreshButton.click();
          await page.waitForTimeout(TEST_CONFIG.POLL_INTERVAL_MS);
        } else {
          // ステータス確認ボタンが表示されない = FAILED or COMPLETED になった
          break;
        }

        // FAILEDステータスが表示されているか確認
        const failedStatus = page.locator('text=🔴 失敗');
        const isFailed = await failedStatus.isVisible().catch(() => false);

        if (isFailed) {
          break;
        }

        attemptCount++;
      }

      // Step 5: FAILEDステータスが表示されることを確認
      const failedStatus = page.locator('text=🔴 失敗');
      await expect(failedStatus).toBeVisible({ timeout: 10000 });

      // ステータス説明が表示されることを確認
      await expect(page.locator('text=変換処理に失敗しました')).toBeVisible();

      // Step 6: エラーメッセージが表示されることを確認
      const errorSection = page.locator('role=alert').filter({ hasText: 'エラー詳細' });
      await expect(errorSection).toBeVisible();

      // エラーメッセージに何らかのテキストが含まれていることを確認
      const errorMessage = await errorSection.textContent();
      expect(errorMessage).toBeTruthy();
      expect(errorMessage!.length).toBeGreaterThan(0);

      // Step 7: ダウンロードボタンが表示されないことを確認
      const downloadButton = page.getByRole('button', { name: 'ダウンロード' });
      await expect(downloadButton).not.toBeVisible();

      // Step 8: 新規変換ボタンが表示されることを確認
      const newConversionButton = page.getByRole('button', { name: '新しい動画を変換' });
      await expect(newConversionButton).toBeVisible();
      await expect(newConversionButton).toBeEnabled();

      // 新規変換ボタンをクリックしてホームページに戻れることを確認
      await newConversionButton.click();
      await expect(page.getByRole('heading', { name: 'Codec Converter' })).toBeVisible();
    } finally {
      // テストファイルをクリーンアップ
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  test('should show error message when API fails', async ({ page }) => {
    // ホームページに移動
    await page.goto('/');

    // APIリクエストをインターセプトしてエラーレスポンスを返す
    await page.route('**/api/jobs', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Internal Server Error',
        }),
      });
    });

    // ファイルを作成
    const tmpDir = os.tmpdir();
    const testFileName = generateTestFileName();
    const testFilePath = path.join(tmpDir, testFileName);
    const fileBuffer = createTestVideoFile(10); // 10MB
    fs.writeFileSync(testFilePath, fileBuffer);

    try {
      // ファイルをアップロード
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testFilePath);

      // 変換開始ボタンをクリック
      const submitButton = page.getByRole('button', { name: '変換開始' });
      await submitButton.click();

      // エラーメッセージが表示されることを確認
      const errorAlert = page.locator('role=alert');
      await expect(errorAlert).toBeVisible({ timeout: 10000 });

      // エラーメッセージに内容が含まれることを確認
      const errorText = await errorAlert.textContent();
      expect(errorText).toBeTruthy();
      expect(errorText!.length).toBeGreaterThan(0);

      // ジョブ詳細ページにリダイレクトされないことを確認
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/');
      expect(page.url()).not.toContain('/jobs/');
    } finally {
      // テストファイルをクリーンアップ
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  test('should handle job not found error', async ({ page }) => {
    // 存在しないジョブIDでジョブ詳細ページにアクセス
    const nonExistentJobId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`/jobs/${nonExistentJobId}`);

    // エラーメッセージが表示されることを確認
    const errorAlert = page.locator('role=alert');
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
    await expect(errorAlert).toContainText('指定されたジョブが見つかりません');

    // 新規変換ボタンが表示されることを確認
    const newConversionButton = page.getByRole('button', { name: '新しい動画を変換' });
    await expect(newConversionButton).toBeVisible();
  });
});
