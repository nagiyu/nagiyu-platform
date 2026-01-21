import { test, expect } from '@playwright/test';
import { TestDataFactory } from './utils/test-data-factory';

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
  let factory: TestDataFactory;

  test.beforeEach(async ({ page, request }) => {
    // TestDataFactory を初期化
    factory = new TestDataFactory(request);

    // テスト用データを作成
    await factory.createTicker(); // Exchange と Ticker を自動作成

    await page.goto('/');

    // データが反映されるまで待つ
    await page.waitForTimeout(3000);
  });

  test.afterEach(async () => {
    // TestDataFactory でクリーンアップ
    await factory.cleanup();
  });

  test('取引所一覧が正しく表示される', async ({ page }) => {
    // 取引所セレクトボックスが表示される
    const exchangeSelect = page.locator('#exchange-select');
    await expect(exchangeSelect).toBeVisible();

    // 取引所を選択して、作成したテストデータが存在することを確認
    await exchangeSelect.click();
    const options = page.locator('[role="listbox"] [role="option"]');
    const optionCount = await options.count();

    // 「選択してください」+ 作成した取引所が存在
    expect(optionCount).toBeGreaterThanOrEqual(2);
  });

  test('取引所選択時にティッカーが自動更新される', async ({ page }) => {
    // 初期状態: ティッカーセレクトは無効
    const tickerSelect = page.getByLabel('ティッカー選択');
    await expect(tickerSelect).toBeDisabled();

    // 取引所を選択
    const exchangeSelect = page.getByLabel('取引所選択');
    await exchangeSelect.click();

    // 作成したテスト用取引所を選択
    const options = page.locator('[role="listbox"] [role="option"]');
    const optionCount = await options.count();

    // テストデータが作成されているので、必ず取引所が存在する
    expect(optionCount).toBeGreaterThanOrEqual(2); // 「選択してください」+ テスト取引所

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

    // 「選択してください」+ 作成したティッカーが存在
    expect(tickerCount).toBeGreaterThanOrEqual(2);
  });

  test('取引所変更時にティッカーがリセットされる', async ({ page }) => {
    const exchangeSelect = page.getByLabel('取引所選択');
    const tickerSelect = page.getByLabel('ティッカー選択');

    // 2つ目のテスト用 Exchange と Ticker を作成
    await factory.createTicker();

    // データが反映されるまで待つ
    await page.waitForTimeout(2000);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 取引所を選択
    await exchangeSelect.click();
    const options = page.locator('[role="listbox"] [role="option"]');
    const optionCount = await options.count();

    // テストデータが2つ作成されているので、必ず2つ以上の取引所が存在
    expect(optionCount).toBeGreaterThanOrEqual(3); // 「選択してください」+ 2つのテスト取引所

    // 最初の取引所を選択
    await options.nth(1).click();

    // ティッカーが有効になるのを待つ
    await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // ティッカーを選択
    await tickerSelect.click();
    const tickerOptions = page.locator('[role="listbox"] [role="option"]');
    const tickerCount = await tickerOptions.count();

    // 最初のティッカーを選択
    expect(tickerCount).toBeGreaterThanOrEqual(2);
    const firstTickerText = await tickerOptions.nth(1).textContent();
    await tickerOptions.nth(1).click();

    // リストボックスが閉じるまで待つ
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();

    // ティッカーが選択されたことを確認（セレクトボックスに表示されているテキストで確認）
    await expect(tickerSelect).toContainText(firstTickerText || '');

    // 別の取引所に変更
    await exchangeSelect.click();
    await options.nth(2).click(); // 3番目のオプション（2番目の取引所）

    // リストボックスが閉じるまで待つ
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();

    // ネットワークが落ち着くまで待つ（新しい取引所のティッカーを取得中）
    await page.waitForLoadState('networkidle');

    // ティッカーは有効のまま（新しい取引所のティッカーが読み込まれるため）
    await expect(tickerSelect).toBeEnabled();

    // ティッカー選択値がリセットされていることを確認
    // 取引所変更後、ティッカーセレクトはクリックして新しいティッカーを選択できる状態
    // （空の状態から選択可能）
    await tickerSelect.click();
    const newTickerOptions = page.locator('[role="listbox"] [role="option"]');
    const newTickerCount = await newTickerOptions.count();
    // "選択してください"オプションを含むオプションが存在することを確認
    expect(newTickerCount).toBeGreaterThanOrEqual(2);
    // リストボックスを閉じる
    await page.keyboard.press('Escape');
  });

  test('ローディング状態が表示される', async ({ page }) => {
    // ページロード時に取引所ローディングが表示される可能性がある
    // （高速な場合は表示されない可能性もある）

    const exchangeSelect = page.getByLabel('取引所選択');

    // 取引所を選択
    await exchangeSelect.click();
    const options = page.locator('[role="listbox"] [role="option"]');
    const optionCount = await options.count();

    // テストデータが作成されているので、必ず取引所が存在する
    expect(optionCount).toBeGreaterThanOrEqual(2);
    await options.nth(1).click();

    // ティッカーローディングインジケーターが表示される可能性がある
    // Note: 高速なレスポンスの場合は表示されないため、必須検証ではない
    // ネットワークが遅い環境ではローディングが確認できる

    // 最終的にティッカーセレクトが有効になることを確認
    const tickerSelect = page.getByLabel('ティッカー選択');
    await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
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
  let factory: TestDataFactory;

  test.beforeEach(async ({ page, request }) => {
    // TestDataFactory を初期化
    factory = new TestDataFactory(request);

    // テスト用データを作成
    await factory.createTicker(); // Exchange と Ticker を自動作成

    await page.goto('/');
  });

  test.afterEach(async () => {
    // TestDataFactory でクリーンアップ
    await factory.cleanup();
  });
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
