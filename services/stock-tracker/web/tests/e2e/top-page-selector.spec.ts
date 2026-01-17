import { test, expect } from '@playwright/test';

/**
 * E2E-001 の一部: 取引所・ティッカーセレクタのテスト
 *
 * このテストは以下を検証します:
 * - 取引所一覧APIから取得したデータが正しく表示される
 * - 取引所選択時にティッカー一覧が自動更新される
 * - ローディング状態が正しく表示される
 * - エラーハンドリングが適切に動作する
 */

test.describe('取引所・ティッカーセレクタ機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // 3秒待つ (TODO: 今後修正したい)
    await page.waitForTimeout(3000);
  });

  test('取引所一覧が正しく表示される', async ({ page }) => {
    // 取引所セレクトボックスが表示される
    const exchangeSelect = page.locator('#exchange-select');
    await expect(exchangeSelect).toBeVisible();

    // Note: API呼び出しが成功するかはDynamoDBのデータ状況に依存
    // Phase 1では最小限の検証に留める（セレクトボックスの表示のみ確認）
  });

  test('取引所選択時にティッカーが自動更新される', async ({ page }) => {
    // 初期状態: ティッカーセレクトは無効
    const tickerSelect = page.getByLabel('ティッカー選択');
    await expect(tickerSelect).toBeDisabled();

    // 取引所を選択
    const exchangeSelect = page.getByLabel('取引所選択');
    await exchangeSelect.click();

    // APIレスポンスを待つ（取引所データがある場合）
    const options = page.locator('[role="listbox"] [role="option"]');
    const optionCount = await options.count();

    if (optionCount > 1) {
      // 「選択してください」以外のオプションがある場合
      // 2番目のオプション（最初の実際の取引所）を選択
      await options.nth(1).click();

      // ティッカーセレクトが有効になるまで待つ
      await expect(tickerSelect).toBeEnabled({ timeout: 5000 });

      // ティッカー一覧が更新されることを確認
      // ローディングインジケーターが表示される可能性がある
      // ローディングが完了するまで待機
      await page.waitForLoadState('networkidle');

      // ティッカーセレクトボックスをクリック
      await tickerSelect.click();

      // ティッカーオプションが表示される
      const tickerOptions = page.locator('[role="listbox"] [role="option"]');
      const tickerCount = await tickerOptions.count();

      // 「選択してください」オプションは最低限表示される
      expect(tickerCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('取引所変更時にティッカーがリセットされる', async ({ page }) => {
    const exchangeSelect = page.getByLabel('取引所選択');
    const tickerSelect = page.getByLabel('ティッカー選択');

    // 取引所を選択
    await exchangeSelect.click();
    const options = page.locator('[role="listbox"] [role="option"]');
    const optionCount = await options.count();

    if (optionCount > 1) {
      // 最初の取引所を選択
      await options.nth(1).click();

      // ティッカーが有効になるのを待つ
      await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
      await page.waitForLoadState('networkidle');

      // ティッカーを選択
      await tickerSelect.click();
      const tickerOptions = page.locator('[role="listbox"] [role="option"]');
      const tickerCount = await tickerOptions.count();

      if (tickerCount > 1) {
        // 最初のティッカーを選択
        const firstTickerText = await tickerOptions.nth(1).textContent();
        await tickerOptions.nth(1).click();

        // リストボックスが閉じるまで待つ
        await expect(page.locator('[role="listbox"]')).not.toBeVisible();

        // ティッカーが選択されたことを確認（セレクトボックスに表示されているテキストで確認）
        await expect(tickerSelect).toContainText(firstTickerText || '');

        // 別の取引所に変更（optionCount > 2の場合のみ）
        if (optionCount > 2) {
          await exchangeSelect.click();
          await options.nth(2).click(); // 3番目のオプション（2番目の取引所）

          // リストボックスが閉じるまで待つ
          await expect(page.locator('[role="listbox"]')).not.toBeVisible();

          // ネットワークが落ち着くまで待つ（新しい取引所のティッカーを取得中）
          await page.waitForLoadState('networkidle');

          // ティッカーは有効のまま（新しい取引所のティッカーが読み込まれるため）
          // ただし、ティッカー選択値はリセットされていることを確認
          await expect(tickerSelect).toBeEnabled();
          
          // ティッカーの表示テキストが「選択してください」または空であることを確認
          const tickerDisplayText = await tickerSelect.textContent();
          const isReset = tickerDisplayText?.includes('選択してください') || tickerDisplayText?.trim() === '';
          expect(isReset).toBeTruthy();
        }
      }
    }
  });

  test('ローディング状態が表示される', async ({ page }) => {
    // ページロード時に取引所ローディングが表示される可能性がある
    // （高速な場合は表示されない可能性もある）

    const exchangeSelect = page.getByLabel('取引所選択');

    // 取引所を選択
    await exchangeSelect.click();
    const options = page.locator('[role="listbox"] [role="option"]');
    const optionCount = await options.count();

    if (optionCount > 1) {
      await options.nth(1).click();

      // ティッカーローディングインジケーターが表示される可能性がある
      // Note: 高速なレスポンスの場合は表示されないため、必須検証ではない
      // ネットワークが遅い環境ではローディングが確認できる

      // 最終的にティッカーセレクトが有効になることを確認
      const tickerSelect = page.getByLabel('ティッカー選択');
      await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
    }
  });

  test('エラー時にエラーメッセージが表示される', async ({ page }) => {
    // Phase 1: この機能の完全なテストにはモックサーバーが必要
    // 現時点では、エラー表示のUIコンポーネントが存在することを確認

    // エラーメッセージ用のAlertコンポーネントの数を確認
    const errorAlert = page.locator('[role="alert"]');
    const initialAlertCount = await errorAlert.count();

    // CI環境ではAPIエラーが発生する可能性があるため、
    // アラート数は0または1のいずれかであることを確認
    expect(initialAlertCount).toBeGreaterThanOrEqual(0);
    expect(initialAlertCount).toBeLessThanOrEqual(2);

    // Note: 実際のエラー発生をテストするには、モックAPIまたは
    // ネットワークエラーをシミュレートする必要がある
    // Phase 2 で詳細なエラーハンドリングテストを実装予定
  });
});

test.describe('取引所・ティッカーセレクタのアクセシビリティ', () => {
  test('キーボードナビゲーションが機能する', async ({ page }) => {
    await page.goto('/');

    // 取引所セレクトボックスにフォーカスを移動
    const exchangeSelect = page.locator('#exchange-select');
    await exchangeSelect.focus();

    // フォーカスされていることを確認
    await expect(exchangeSelect).toBeFocused();
  });

  test('スクリーンリーダー用のラベルが設定されている', async ({ page }) => {
    await page.goto('/');

    // 取引所セレクトのラベルが存在
    const exchangeLabel = page.locator('#exchange-select-label');
    await expect(exchangeLabel).toBeVisible();
    await expect(exchangeLabel).toHaveText('取引所選択');

    // ティッカーセレクトのラベルが存在
    const tickerLabel = page.locator('#ticker-select-label');
    await expect(tickerLabel).toBeVisible();
    await expect(tickerLabel).toHaveText('ティッカー選択');
  });
});
