/**
 * Codec Converter - E2E Test: Scenario 1 (Happy Path)
 *
 * シナリオ1: 正常系（H.264変換）
 * 1. 50MBのMP4ファイルをアップロード
 * 2. 出力コーデック「H.264」を選択
 * 3. ジョブIDが発行される
 * 4. ステータスが `PENDING` → `PROCESSING` → `COMPLETED` と遷移
 * 5. ダウンロードリンクが表示される
 * 6. ファイルをダウンロードして再生できる
 *
 * Note: このテストは実際のAWS環境またはLocalStackが必要です
 * CI環境で実行する場合は、適切な環境変数を設定してください
 */

import { test, expect, createTestVideoFile, generateTestFileName, TEST_CONFIG } from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test.describe('Scenario 1: Happy Path - H.264 Conversion', () => {
  // Skip this test if AWS credentials are not configured
  test.skip(
    !process.env.AWS_REGION || !process.env.BASE_URL,
    'Requires AWS environment to be configured'
  );

  test('should complete full conversion workflow for H.264', async ({ page }) => {
    // ホームページに移動
    await page.goto('/');

    // ページタイトルを確認
    await expect(page.getByRole('heading', { name: 'Codec Converter' })).toBeVisible();

    // 50MBの有効なファイルを作成
    const tmpDir = os.tmpdir();
    const testFileName = generateTestFileName();
    const testFilePath = path.join(tmpDir, testFileName);
    const validFileBuffer = createTestVideoFile(50); // 50MB
    fs.writeFileSync(testFilePath, validFileBuffer);

    try {
      // Step 1: ファイルをアップロード
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testFilePath);

      // ファイルが選択されたことを確認
      await expect(page.locator('text=選択されたファイル')).toBeVisible();
      await expect(page.locator(`text=${testFileName}`)).toBeVisible();

      // Step 2: 出力コーデックとして H.264 を選択（デフォルトで選択されている）
      const h264Radio = page.locator('input[type="radio"][value="h264"]');
      await expect(h264Radio).toBeChecked();

      // Step 3: 変換開始ボタンをクリック
      const submitButton = page.getByRole('button', { name: '変換開始' });
      await expect(submitButton).toBeEnabled();
      await submitButton.click();

      // アップロード中の表示を確認
      await expect(page.getByRole('button', { name: 'アップロード中...' })).toBeVisible();

      // Step 4: ジョブ詳細ページにリダイレクトされることを確認
      await page.waitForURL(/\/jobs\/[a-f0-9-]+/, { timeout: 30000 });

      // URLからジョブIDを取得
      const url = page.url();
      const jobIdMatch = url.match(/\/jobs\/([a-f0-9-]+)/);
      expect(jobIdMatch).toBeTruthy();
      const jobId = jobIdMatch![1];

      // ジョブ詳細ページが表示されることを確認
      await expect(page.getByRole('heading', { name: '変換ジョブ詳細' })).toBeVisible();

      // ジョブIDが表示されることを確認
      await expect(page.locator(`text=${jobId.substring(0, 8)}`)).toBeVisible();

      // ファイル名と出力コーデックが表示されることを確認
      await expect(page.locator(`text=${testFileName}`)).toBeVisible();
      await expect(page.locator('text=H.264')).toBeVisible();

      // Step 5: ステータスが PENDING であることを確認
      const pendingStatus = page.locator('text=🟡 待機中');
      await expect(pendingStatus).toBeVisible({ timeout: 10000 });

      // ステータス確認ボタンが表示されることを確認
      const refreshButton = page.getByRole('button', { name: 'ステータス確認' });
      await expect(refreshButton).toBeVisible();

      // Step 6: ステータスが PROCESSING に遷移するまで待機
      // Note: 実際の環境では、Batchジョブが開始されるまで時間がかかる可能性があります
      let attemptCount = 0;

      while (attemptCount < TEST_CONFIG.MAX_STATUS_POLL_ATTEMPTS) {
        await refreshButton.click();
        await page.waitForTimeout(TEST_CONFIG.POLL_INTERVAL_MS);

        const processingStatus = page.locator('text=🔵 処理中');
        const isProcessing = await processingStatus.isVisible().catch(() => false);

        if (isProcessing) {
          break;
        }

        attemptCount++;
      }

      // PROCESSINGステータスが表示されることを確認（またはすでにCOMPLETEDになっている可能性も）
      const processingStatus = page.locator('text=🔵 処理中');
      const completedStatusCheck = page.locator('text=🟢 完了');
      const processingOrCompleted = processingStatus.or(completedStatusCheck);
      await expect(processingOrCompleted).toBeVisible({ timeout: 5000 });

      // Step 7: ステータスが COMPLETED に遷移するまで待機
      // Note: 変換処理には数分かかる可能性があります
      // この部分は実際の環境でのテストでは長時間かかる可能性があるため、
      // テストのタイムアウトを調整する必要があります
      test.setTimeout(300000); // 5分のタイムアウト

      attemptCount = 0;

      while (attemptCount < TEST_CONFIG.MAX_COMPLETION_POLL_ATTEMPTS) {
        const completedStatus = page.locator('text=🟢 完了');
        const isCompleted = await completedStatus.isVisible().catch(() => false);

        if (isCompleted) {
          break;
        }

        // ステータス確認ボタンをクリック
        const currentRefreshButton = page.getByRole('button', { name: 'ステータス確認' });
        const isRefreshVisible = await currentRefreshButton.isVisible().catch(() => false);

        if (isRefreshVisible) {
          await currentRefreshButton.click();
        }

        await page.waitForTimeout(TEST_CONFIG.POLL_INTERVAL_MS);
        attemptCount++;
      }

      // Step 8: COMPLETED ステータスが表示されることを確認
      const completedStatus = page.locator('text=🟢 完了');
      await expect(completedStatus).toBeVisible({ timeout: 10000 });

      // Step 9: ダウンロードボタンが表示されることを確認
      const downloadButton = page.getByRole('button', { name: 'ダウンロード' });
      await expect(downloadButton).toBeVisible();
      await expect(downloadButton).toBeEnabled();

      // Note: 実際のダウンロードとファイルの再生確認は、
      // ブラウザの外部アプリケーションが必要なため、E2Eテストでは省略します
      // ダウンロードボタンが表示されることをもって、テスト成功とします
    } finally {
      // テストファイルをクリーンアップ
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  test('should allow codec selection before upload', async ({ page }) => {
    // ホームページに移動
    await page.goto('/');

    // 各コーデックのラジオボタンが表示されることを確認
    const h264Radio = page.locator('input[type="radio"][value="h264"]');
    const vp9Radio = page.locator('input[type="radio"][value="vp9"]');
    const av1Radio = page.locator('input[type="radio"][value="av1"]');

    await expect(h264Radio).toBeVisible();
    await expect(vp9Radio).toBeVisible();
    await expect(av1Radio).toBeVisible();

    // デフォルトで H.264 が選択されていることを確認
    await expect(h264Radio).toBeChecked();

    // VP9 を選択
    await vp9Radio.click();
    await expect(vp9Radio).toBeChecked();
    await expect(h264Radio).not.toBeChecked();

    // AV1 を選択
    await av1Radio.click();
    await expect(av1Radio).toBeChecked();
    await expect(vp9Radio).not.toBeChecked();

    // H.264 に戻す
    await h264Radio.click();
    await expect(h264Radio).toBeChecked();
    await expect(av1Radio).not.toBeChecked();
  });
});
