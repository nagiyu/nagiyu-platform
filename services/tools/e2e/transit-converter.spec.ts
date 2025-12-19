import { test, expect } from './helpers';
import { Page } from '@playwright/test';

// テストデータ: 実際の乗り換え案内フォーマット
const VALID_TRANSIT_TEXT = `渋谷 ⇒ 新宿
2025年1月15日(月)
09:00 ⇒ 09:15
------------------------------
所要時間 15分
運賃[IC優先] 200円
乗換 0回
距離 5.2 km
------------------------------

■渋谷
↓ 09:00〜09:15
↓ JR山手線 池袋行
↓ 3番線発 → 15番線着
■新宿`;

const VALID_TRANSIT_TEXT_WITH_TRANSFER = `東京 ⇒ 横浜
2025年1月15日(月)
10:00 ⇒ 10:45
------------------------------
所要時間 45分
運賃[IC優先] 500円
乗換 1回
距離 30.5 km
------------------------------

■東京
↓ 10:00〜10:20
↓ JR東海道線 熱海行
↓ 1番線発 → 2番線着
■品川
↓ 10:25〜10:45
↓ JR京浜東北線 横浜方面
↓ 3番線発 → 4番線着
■横浜`;

// 無効な入力データ
const INVALID_TRANSIT_TEXT = `これは乗り換え案内ではありません
ただのテキストです`;

const EMPTY_INPUT = '';

test.describe('Transit Converter - E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // 各テスト前にLocalStorageをクリア
    await page.goto('/transit-converter');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe('1. 基本フロー（入力→変換→コピー）', () => {
    test('should convert transit text and copy to clipboard', async ({ page, context }) => {
      // クリップボード権限の付与
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // ページの全textareaを取得し、最初の空のものが入力フィールド
      // Material UIでは、label配下にtextareaがあるので、「入力」セクションの下のtextareaを探す
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await expect(inputField).toBeVisible();
      await inputField.fill(VALID_TRANSIT_TEXT);

      // 変換ボタンをクリック
      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await expect(convertButton).toBeEnabled();
      await convertButton.click();

      // 成功メッセージのSnackbarが表示されることを確認
      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });

      // 出力フィールド - 「出力」セクションの下のtextarea
      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      await expect(outputField).toBeVisible();
      
      // 出力フィールドに値が入っていることを確認
      const outputValue = await outputField.inputValue();
      expect(outputValue).toContain('渋谷');
      expect(outputValue).toContain('新宿');
      expect(outputValue).toContain('09:00');

      // コピーボタンをクリック
      const copyButton = page.getByRole('button', { name: '変換結果をクリップボードにコピーする' });
      await expect(copyButton).toBeEnabled();
      await copyButton.click();

      // コピー成功のSnackbarが表示されることを確認
      await expect(page.locator('text=クリップボードにコピーしました')).toBeVisible({ timeout: 10000 });

      // クリップボードの内容を確認
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('渋谷');
      expect(clipboardText).toContain('新宿');
    });

    test('should handle transit text with transfers', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_TRANSIT_TEXT_WITH_TRANSFER);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });

      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const outputValue = await outputField.inputValue();
      
      // 乗り換え情報が含まれていることを確認
      expect(outputValue).toContain('東京');
      expect(outputValue).toContain('横浜');
      expect(outputValue).toContain('品川'); // 乗り換え駅
      expect(outputValue).toContain('1回'); // 乗換回数
    });
  });

  test.describe('2. クリップボード読み取り機能', () => {
    test('should read text from clipboard', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // クリップボードにテキストを設定
      await page.evaluate((text) => {
        return navigator.clipboard.writeText(text);
      }, VALID_TRANSIT_TEXT);

      // 「クリップボードから読み取り」ボタンをクリック
      const readButton = page.getByRole('button', { name: /クリップボードから読み取り/ });
      await readButton.click();

      // 入力欄に自動挿入されることを確認
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await page.waitForTimeout(500); // 挿入を待つ
      const inputValue = await inputField.inputValue();
      expect(inputValue).toBe(VALID_TRANSIT_TEXT);

      // 成功メッセージが表示されることを確認
      await expect(page.locator('text=クリップボードから読み取りました')).toBeVisible();
    });

    test('should handle clipboard permission error gracefully', async ({ page }) => {
      // 権限を付与しない状態でクリップボード読み取りを試みる
      const readButton = page.getByRole('button', { name: /クリップボードから読み取り/ });
      await readButton.click();

      // エラーメッセージが表示されることを確認
      // Note: ブラウザによってエラーメッセージが異なる可能性があるため、
      // Snackbarが表示されること自体を確認
      await page.waitForTimeout(1000); // エラー処理を待つ
      const alert = page.locator('[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('3. Web Share Target機能（URLパラメータ経由）', () => {
    test('should auto-fill from ?url parameter', async ({ page }) => {
      const encodedUrl = encodeURIComponent('https://example.com/transit?data=test');
      await page.goto(`/transit-converter?url=${encodedUrl}`);

      // 入力欄に自動挿入されることを確認
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await page.waitForTimeout(1000); // useEffect実行を待つ
      const inputValue = await inputField.inputValue();
      expect(inputValue).toBe('https://example.com/transit?data=test');

      // 通知が表示されることを確認
      await expect(page.locator('text=共有されたデータを読み込みました')).toBeVisible({ timeout: 10000 });

      // URLパラメータがクリーンアップされることを確認
      await page.waitForTimeout(500);
      expect(page.url()).toContain('/transit-converter');
      expect(page.url()).not.toContain('?url=');
    });

    test('should auto-fill from ?text parameter', async ({ page }) => {
      const testText = '渋谷 ⇒ 新宿';
      const encodedText = encodeURIComponent(testText);
      await page.goto(`/transit-converter?text=${encodedText}`);

      // 入力欄に自動挿入されることを確認
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await page.waitForTimeout(1000);
      const inputValue = await inputField.inputValue();
      expect(inputValue).toBe(testText);

      // 通知が表示されることを確認
      await expect(page.locator('text=共有されたデータを読み込みました')).toBeVisible({ timeout: 10000 });

      // URLパラメータがクリーンアップされることを確認
      await page.waitForTimeout(500);
      expect(page.url()).toContain('/transit-converter');
      expect(page.url()).not.toContain('?text=');
    });

    test('should prioritize ?url over ?text', async ({ page }) => {
      const testUrl = 'https://example.com/transit';
      const testText = '渋谷 ⇒ 新宿';
      await page.goto(`/transit-converter?url=${encodeURIComponent(testUrl)}&text=${encodeURIComponent(testText)}`);

      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await page.waitForTimeout(1000);
      const inputValue = await inputField.inputValue();
      
      // URLが優先されることを確認
      expect(inputValue).toBe(testUrl);
    });
  });

  test.describe('4. 表示設定の永続化（LocalStorage）', () => {
    test('should save and restore display settings', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // まず変換を実行して出力を生成
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_TRANSIT_TEXT_WITH_TRANSFER);
      
      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });

      // 初期状態の出力を取得
      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const initialOutput = await outputField.inputValue();
      expect(initialOutput).toBeTruthy();

      // チェックボックスを見つけて操作
      // 表示設定セクションを開く
      const settingsButton = page.getByRole('button', { name: /表示設定/ });
      await settingsButton.click();
      await page.waitForTimeout(500);

      // 設定を変更 (例: 距離を表示)
      const checkboxes = await page.locator('input[type="checkbox"]').all();
      if (checkboxes.length > 0) {
        // 最初のチェックボックスの状態を切り替え
        const firstCheckbox = checkboxes[0];
        const isChecked = await firstCheckbox.isChecked();
        await firstCheckbox.click();
        await page.waitForTimeout(500);
        
        // 状態が変わったことを確認
        const newState = await firstCheckbox.isChecked();
        expect(newState).toBe(!isChecked);
      }

      // ページをリロード
      await page.reload();
      await page.waitForLoadState('networkidle');

      // LocalStorageから設定が復元されることを確認
      const storedSettings = await page.evaluate(() => {
        const data = localStorage.getItem('transit-converter-display-settings');
        return data ? JSON.parse(data) : null;
      });

      expect(storedSettings).toBeTruthy();
    });

    test('should work in private mode (localStorage unavailable)', async ({ page }) => {
      // LocalStorageを無効化
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: () => { throw new Error('localStorage is disabled'); },
            setItem: () => { throw new Error('localStorage is disabled'); },
            removeItem: () => { throw new Error('localStorage is disabled'); },
            clear: () => { throw new Error('localStorage is disabled'); },
            key: () => null,
            length: 0,
          },
          writable: false,
        });
      });

      await page.goto('/transit-converter');

      // ページが正常にロードされることを確認（エラーが発生しない）
      const heading = page.locator('h1, h4').filter({ hasText: /乗り換え変換/ });
      await expect(heading).toBeVisible();

      // 基本機能が動作することを確認
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_TRANSIT_TEXT);
      
      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      // 変換が成功することを確認
      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('5. エラーハンドリング', () => {
    test('should show error for invalid input format', async ({ page }) => {
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(INVALID_TRANSIT_TEXT);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      // エラーメッセージが表示されることを確認
      await page.waitForTimeout(1000);
      const errorSnackbar = page.locator('[role="alert"]');
      await expect(errorSnackbar).toBeVisible({ timeout: 10000 });
      
      // エラーメッセージの内容を確認
      const errorText = await errorSnackbar.textContent();
      expect(errorText).toMatch(/解析できませんでした|正しく解析/);
    });

    test('should show error for empty input', async ({ page }) => {
      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      
      // 空入力の場合、変換ボタンが無効になることを確認
      await expect(convertButton).toBeDisabled();
    });

    test('should show error when parsing fails', async ({ page }) => {
      // ⇒は含むが、他のフォーマットが不正なテキスト
      const partiallyValidText = '渋谷 ⇒ 新宿\n不正なフォーマット';
      
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(partiallyValidText);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      // エラーメッセージが表示されることを確認
      await page.waitForTimeout(1000);
      const errorSnackbar = page.locator('[role="alert"]');
      await expect(errorSnackbar).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('6. クリア機能', () => {
    test('should clear both input and output', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // まず入力して変換
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_TRANSIT_TEXT);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });

      // 出力が生成されることを確認
      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const outputBefore = await outputField.inputValue();
      expect(outputBefore).toBeTruthy();

      // クリアボタンをクリック
      const clearButton = page.getByRole('button', { name: '入力と出力をクリアする' });
      await clearButton.click();

      // 入力と出力が空になることを確認
      const inputAfter = await inputField.inputValue();
      const outputAfter = await outputField.inputValue();
      expect(inputAfter).toBe('');
      expect(outputAfter).toBe('');
    });

    test('should disable clear button when no input or output', async ({ page }) => {
      const clearButton = page.getByRole('button', { name: '入力と出力をクリアする' });
      
      // 初期状態ではクリアボタンが無効
      await expect(clearButton).toBeDisabled();
    });
  });

  test.describe('7. アクセシビリティ', () => {
    test('should pass accessibility tests', async ({ page, makeAxeBuilder }) => {
      await page.goto('/transit-converter');

      const accessibilityScanResults = await makeAxeBuilder()
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await page.goto('/transit-converter');

      // 重要なボタンにARIAラベルが設定されていることを確認
      // 正確なテキストで指定してstrict mode violationを回避
      await expect(page.getByRole('button', { name: 'クリップボードから乗り換え案内テキストを読み取る' })).toHaveAttribute('aria-label');
      await expect(page.getByRole('button', { name: '乗り換え案内テキストを変換する' })).toHaveAttribute('aria-label');
      await expect(page.getByRole('button', { name: '変換結果をクリップボードにコピーする' })).toHaveAttribute('aria-label');
      await expect(page.getByRole('button', { name: '入力と出力をクリアする' })).toHaveAttribute('aria-label');
    });
  });
});
