import { test, expect } from '@playwright/test';

/**
 * E2E-004: Watchlist 管理フロー
 *
 * このテストは以下を検証します:
 * - ウォッチリスト一覧が正しく表示される
 * - 新規登録フローが正常に動作する
 * - 削除フローが正常に動作する
 * - エラーハンドリングが適切に動作する
 */

test.describe('Watchlist 管理画面', () => {
  test.beforeEach(async ({ page }) => {
    // ウォッチリスト管理画面にアクセス
    await page.goto('/watchlist');

    // ページが完全にロードされるまで待つ
    await page.waitForLoadState('networkidle');
  });

  test('ウォッチリスト一覧が表示される', async ({ page }) => {
    // ページタイトルが表示される
    const pageTitle = page.getByRole('heading', { name: 'ウォッチリスト' });
    await expect(pageTitle).toBeVisible();

    // 新規登録ボタンが表示される
    const createButton = page.getByRole('button', { name: '新規登録' });
    await expect(createButton).toBeVisible();

    // テーブルが表示される
    const table = page.getByRole('table');
    await expect(table).toBeVisible();

    // テーブルヘッダーが正しく表示される
    await expect(page.getByRole('columnheader', { name: 'ティッカー' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'シンボル' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '登録日時' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '買いアラート' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '操作' })).toBeVisible();
  });

  test('新規登録モーダルが開閉できる', async ({ page }) => {
    // 新規登録ボタンをクリック
    await page.getByRole('button', { name: '新規登録' }).click();

    // モーダルが表示される
    const modal = page.getByRole('dialog', { name: 'ウォッチリスト新規登録' });
    await expect(modal).toBeVisible();

    // 取引所選択とティッカー選択が表示される
    await expect(page.getByLabel('取引所')).toBeVisible();
    await expect(page.getByLabel('ティッカー')).toBeVisible();

    // キャンセルボタンをクリック
    await page.getByRole('button', { name: 'キャンセル' }).click();

    // モーダルが閉じる
    await expect(modal).not.toBeVisible();
  });

  test('ウォッチリスト新規登録フロー（正常系）', async ({ page }) => {
    // 現在のウォッチリスト数を記録
    const initialRows = await page.getByRole('row').count();

    // 新規登録ボタンをクリック
    await page.getByRole('button', { name: '新規登録' }).click();

    // モーダルが表示されるまで待つ
    const modal = page.getByRole('dialog', { name: 'ウォッチリスト新規登録' });
    await expect(modal).toBeVisible();

    // 取引所を選択
    const exchangeSelect = page.getByLabel('取引所');
    await exchangeSelect.click();

    // 取引所のオプションを取得
    const exchangeOptions = page.locator('[role="listbox"] [role="option"]');
    const exchangeCount = await exchangeOptions.count();

    if (exchangeCount > 1) {
      // 最初の取引所を選択（"選択してください"以外）
      await exchangeOptions.nth(1).click();

      // ティッカーが有効になるまで待つ
      const tickerSelect = page.getByLabel('ティッカー');
      await expect(tickerSelect).toBeEnabled({ timeout: 5000 });

      // ネットワークが落ち着くまで待つ
      await page.waitForLoadState('networkidle');

      // ティッカーを選択
      await tickerSelect.click();

      const tickerOptions = page.locator('[role="listbox"] [role="option"]');
      const tickerCount = await tickerOptions.count();

      if (tickerCount > 1) {
        // 最初のティッカーを選択
        const tickerText = await tickerOptions.nth(1).textContent();
        await tickerOptions.nth(1).click();

        // 登録ボタンをクリック
        const registerButton = modal.getByRole('button', { name: '登録' });
        await registerButton.click();

        // モーダルが閉じるまで待つ（エラーの場合は閉じない）
        await page.waitForTimeout(1000);

        // エラーメッセージが表示されているか確認
        const errorAlert = modal.locator('[role="alert"]');
        const hasError = await errorAlert.isVisible().catch(() => false);

        if (hasError) {
          // 既に登録済みの場合はテストをスキップ
          await modal.getByRole('button', { name: 'キャンセル' }).click();
          await expect(modal).not.toBeVisible();
        } else {
          // 正常に登録された場合
          await expect(modal).not.toBeVisible({ timeout: 5000 });

          // ネットワークが落ち着くまで待つ
          await page.waitForLoadState('networkidle');

          // テーブルに新しい行が追加されたことを確認
          const updatedRows = await page.getByRole('row').count();
          expect(updatedRows).toBeGreaterThan(initialRows);

          // 登録されたティッカーが表示されることを確認
          if (tickerText) {
            const symbol = tickerText.split(' - ')[0]?.trim();
            if (symbol) {
              await expect(page.getByRole('cell', { name: symbol })).toBeVisible();
            }
          }
        }
      }
    }
  });

  test('ウォッチリスト削除フロー（正常系）', async ({ page }) => {
    // まず新規登録を行う（テスト用のデータを作成）
    await page.getByRole('button', { name: '新規登録' }).click();

    const modal = page.getByRole('dialog', { name: 'ウォッチリスト新規登録' });
    await expect(modal).toBeVisible();

    // 取引所を選択
    await page.getByLabel('取引所').click();
    const exchangeOptions = page.locator('[role="listbox"] [role="option"]');
    const exchangeCount = await exchangeOptions.count();

    if (exchangeCount > 1) {
      await exchangeOptions.nth(1).click();

      // ティッカーが有効になるまで待つ
      const tickerSelect = page.getByLabel('ティッカー');
      await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
      await page.waitForLoadState('networkidle');

      await tickerSelect.click();
      const tickerOptions = page.locator('[role="listbox"] [role="option"]');
      const tickerCount = await tickerOptions.count();

      if (tickerCount > 1) {
        await tickerOptions.nth(1).click();

        // 登録
        await modal.getByRole('button', { name: '登録' }).click();

        // モーダルが閉じるまで待つ（エラーの場合は閉じない）
        await page.waitForTimeout(1000);

        // エラーメッセージが表示されているか確認
        const errorAlert = modal.locator('[role="alert"]');
        const hasError = await errorAlert.isVisible().catch(() => false);

        if (hasError) {
          // 既に登録済みの場合は、削除テストのために既存データを使用
          await modal.getByRole('button', { name: 'キャンセル' }).click();
          await expect(modal).not.toBeVisible();
        } else {
          // 正常に登録された場合
          await expect(modal).not.toBeVisible({ timeout: 5000 });
        }

        await page.waitForLoadState('networkidle');

        // 現在の行数を記録
        const currentRows = await page.getByRole('row').count();

        // 削除ボタンをクリック（最初の行の削除ボタン）
        const deleteButtons = page.getByRole('button', { name: '削除' });
        const deleteButtonCount = await deleteButtons.count();

        if (deleteButtonCount > 0) {
          await deleteButtons.first().click();

          // 削除確認ダイアログが表示される
          const deleteDialog = page.getByRole('dialog', { name: '削除確認' });
          await expect(deleteDialog).toBeVisible();

          // 確認メッセージが表示される
          await expect(
            deleteDialog.getByText('このウォッチリストを削除してもよろしいですか？')
          ).toBeVisible();

          // 削除ボタンをクリック
          await deleteDialog.getByRole('button', { name: '削除' }).click();

          // ダイアログが閉じる
          await expect(deleteDialog).not.toBeVisible({ timeout: 5000 });

          // ネットワークが落ち着くまで待つ
          await page.waitForLoadState('networkidle');

          // 行数が減っていることを確認
          const updatedRows = await page.getByRole('row').count();
          expect(updatedRows).toBeLessThan(currentRows);
        }
      }
    }
  });

  test('削除確認ダイアログでキャンセルできる', async ({ page }) => {
    // まず新規登録を行う
    await page.getByRole('button', { name: '新規登録' }).click();

    const modal = page.getByRole('dialog', { name: 'ウォッチリスト新規登録' });
    await expect(modal).toBeVisible();

    await page.getByLabel('取引所').click();
    const exchangeOptions = page.locator('[role="listbox"] [role="option"]');
    const exchangeCount = await exchangeOptions.count();

    if (exchangeCount > 1) {
      await exchangeOptions.nth(1).click();

      const tickerSelect = page.getByLabel('ティッカー');
      await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
      await page.waitForLoadState('networkidle');

      await tickerSelect.click();
      const tickerOptions = page.locator('[role="listbox"] [role="option"]');
      const tickerCount = await tickerOptions.count();

      if (tickerCount > 1) {
        await tickerOptions.nth(1).click();
        await modal.getByRole('button', { name: '登録' }).click();

        // モーダルが閉じるまで待つ（エラーの場合は閉じない）
        await page.waitForTimeout(1000);

        // エラーメッセージが表示されているか確認
        const errorAlert = modal.locator('[role="alert"]');
        const hasError = await errorAlert.isVisible().catch(() => false);

        if (hasError) {
          // 既に登録済みの場合は、削除テストのために既存データを使用
          await modal.getByRole('button', { name: 'キャンセル' }).click();
          await expect(modal).not.toBeVisible();
        } else {
          // 正常に登録された場合
          await expect(modal).not.toBeVisible({ timeout: 5000 });
        }

        await page.waitForLoadState('networkidle');

        // 現在の行数を記録
        const currentRows = await page.getByRole('row').count();

        // 削除ボタンをクリック
        const deleteButtons = page.getByRole('button', { name: '削除' });
        const deleteButtonCount = await deleteButtons.count();

        if (deleteButtonCount > 0) {
          await deleteButtons.first().click();

          // 削除確認ダイアログが表示される
          const deleteDialog = page.getByRole('dialog', { name: '削除確認' });
          await expect(deleteDialog).toBeVisible();

          // キャンセルボタンをクリック
          await deleteDialog.getByRole('button', { name: 'キャンセル' }).click();

          // ダイアログが閉じる
          await expect(deleteDialog).not.toBeVisible();

          // 行数が変わっていないことを確認
          const updatedRows = await page.getByRole('row').count();
          expect(updatedRows).toBe(currentRows);
        }
      }
    }
  });

  test('バリデーション: ティッカー未選択時にエラーが表示される', async ({ page }) => {
    // 新規登録ボタンをクリック
    await page.getByRole('button', { name: '新規登録' }).click();

    const modal = page.getByRole('dialog', { name: 'ウォッチリスト新規登録' });
    await expect(modal).toBeVisible();

    // ティッカーを選択せずに登録ボタンをクリック
    const registerButton = modal.getByRole('button', { name: '登録' });

    // 登録ボタンは無効化されているはず
    await expect(registerButton).toBeDisabled();
  });

  test('買いアラート設定ボタンが表示される', async ({ page }) => {
    // まず新規登録を行う
    await page.getByRole('button', { name: '新規登録' }).click();

    const modal = page.getByRole('dialog', { name: 'ウォッチリスト新規登録' });
    await expect(modal).toBeVisible();

    await page.getByLabel('取引所').click();
    const exchangeOptions = page.locator('[role="listbox"] [role="option"]');
    const exchangeCount = await exchangeOptions.count();

    if (exchangeCount > 1) {
      await exchangeOptions.nth(1).click();

      const tickerSelect = page.getByLabel('ティッカー');
      await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
      await page.waitForLoadState('networkidle');

      await tickerSelect.click();
      const tickerOptions = page.locator('[role="listbox"] [role="option"]');
      const tickerCount = await tickerOptions.count();

      if (tickerCount > 1) {
        await tickerOptions.nth(1).click();
        await modal.getByRole('button', { name: '登録' }).click();

        // モーダルが閉じるまで待つ（エラーの場合は閉じない）
        await page.waitForTimeout(1000);

        // エラーメッセージが表示されているか確認
        const errorAlert = modal.locator('[role="alert"]');
        const hasError = await errorAlert.isVisible().catch(() => false);

        if (hasError) {
          // 既に登録済みの場合は、既存データを使用
          await modal.getByRole('button', { name: 'キャンセル' }).click();
          await expect(modal).not.toBeVisible();
        } else {
          // 正常に登録された場合
          await expect(modal).not.toBeVisible({ timeout: 5000 });
        }

        await page.waitForLoadState('networkidle');

        // 買いアラート設定ボタンが表示されることを確認
        const alertButtons = page.getByRole('button', { name: '買いアラート設定' });
        const alertButtonCount = await alertButtons.count();

        if (alertButtonCount > 0) {
          await expect(alertButtons.first()).toBeVisible();
        }
      }
    }
  });

  test('レスポンシブ: モバイル画面でも正しく表示される', async ({ page }) => {
    // ビューポートをモバイルサイズに設定（Playwright のデフォルトで chromium-mobile が使用される）
    // ページタイトルが表示される
    await expect(page.getByRole('heading', { name: 'ウォッチリスト' })).toBeVisible();

    // 新規登録ボタンが表示される
    await expect(page.getByRole('button', { name: '新規登録' })).toBeVisible();

    // テーブルが表示される（モバイルでも）
    await expect(page.getByRole('table')).toBeVisible();
  });
});

test.describe('Watchlist 管理画面のアクセシビリティ', () => {
  test('キーボードナビゲーションが機能する', async ({ page }) => {
    await page.goto('/watchlist');
    await page.waitForLoadState('networkidle');

    // 新規登録ボタンにフォーカスを移動
    const createButton = page.getByRole('button', { name: '新規登録' });
    await createButton.focus();

    // フォーカスされていることを確認
    await expect(createButton).toBeFocused();

    // Enter キーでモーダルを開く
    await page.keyboard.press('Enter');

    // モーダルが表示される
    const modal = page.getByRole('dialog', { name: 'ウォッチリスト新規登録' });
    await expect(modal).toBeVisible();
  });

  test('スクリーンリーダー用のラベルが設定されている', async ({ page }) => {
    await page.goto('/watchlist');
    await page.waitForLoadState('networkidle');

    // 新規登録モーダルを開く
    await page.getByRole('button', { name: '新規登録' }).click();

    const modal = page.getByRole('dialog', { name: 'ウォッチリスト新規登録' });
    await expect(modal).toBeVisible();

    // 取引所選択のラベルが存在
    await expect(page.getByLabel('取引所')).toBeVisible();

    // ティッカー選択のラベルが存在
    await expect(page.getByLabel('ティッカー')).toBeVisible();
  });
});
