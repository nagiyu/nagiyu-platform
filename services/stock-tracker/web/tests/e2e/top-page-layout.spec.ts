import { test, expect } from '@playwright/test';
import { TestDataFactory } from './utils/test-data-factory';

test.describe('トップ画面レイアウト', () => {
  let factory: TestDataFactory;

  test.beforeEach(async ({ page, request }) => {
    // TestDataFactory を初期化してテストデータを作成
    factory = new TestDataFactory(request);

    // テスト用の取引所を作成
    await factory.createExchange({
      exchangeId: 'NYSE',
      name: 'New York Stock Exchange',
      key: 'NYSE',
    });

    // NASDAQ 取引所を作成（取引所変更テスト用）
    await factory.createExchange({
      exchangeId: 'NASDAQ',
      name: 'NASDAQ Stock Market',
      key: 'NASDAQ',
    });

    await page.goto('/');

    // 3秒待つ (TODO: 今後修正したい)
    await page.waitForTimeout(3000);
  });

  test.afterEach(async () => {
    // TestDataFactory でクリーンアップ
    await factory.cleanup();
  });

  test('ページが正しく表示される', async ({ page }) => {
    // ページタイトルが正しい
    await expect(page).toHaveTitle(/Stock Tracker/);

    // ヘッダーが表示される
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('link', { name: /Stock Tracker/ })).toBeVisible();

    // フッターが表示される
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.getByText(/v0.0.0/)).toBeVisible();
  });

  test('セレクトボックスが正しく表示される', async ({ page }) => {
    // 取引所選択
    const exchangeSelect = page.getByLabel('取引所選択');
    await expect(exchangeSelect).toBeVisible();

    // ティッカー選択（初期状態では無効）
    const tickerSelect = page.getByLabel('ティッカー選択');
    await expect(tickerSelect).toBeVisible();
    await expect(tickerSelect).toBeDisabled();

    // 時間枠選択
    const timeframeSelect = page.getByLabel('時間枠');
    await expect(timeframeSelect).toBeVisible();
  });

  test('チャート表示エリアが表示される', async ({ page }) => {
    // チャート表示エリアのヘッダー
    await expect(page.getByRole('heading', { name: 'チャート表示エリア' })).toBeVisible();

    // 初期状態では「取引所とティッカーを選択してください」というメッセージが表示される
    await expect(page.getByText('取引所とティッカーを選択してください')).toBeVisible();
  });

  test('取引所を選択するとティッカーが有効になる', async ({ page }) => {
    // 初期状態ではティッカーは無効
    const tickerSelect = page.getByLabel('ティッカー選択');
    await expect(tickerSelect).toBeDisabled();

    // 取引所を選択
    const exchangeSelect = page.getByLabel('取引所選択');
    await exchangeSelect.click();
    await page.locator('[role="listbox"]').getByText('New York Stock Exchange').click();

    // ティッカーが有効になる
    await expect(tickerSelect).toBeEnabled();
  });

  test('取引所変更時にティッカーの状態が更新される', async ({ page }) => {
    // 初期状態: ティッカーは無効
    const tickerSelect = page.locator('#ticker-select');
    await expect(tickerSelect).toBeDisabled();

    // 取引所を選択すると、ティッカーが有効になる
    const exchangeSelect = page.locator('#exchange-select');
    await exchangeSelect.click();
    await page.locator('[role="listbox"]').getByText('New York Stock Exchange').click();
    await expect(tickerSelect).toBeEnabled();

    // 異なる取引所に変更しても、ティッカーは有効のまま
    await exchangeSelect.click();
    await page.locator('[role="listbox"]').getByText('NASDAQ Stock Market').click();
    await expect(tickerSelect).toBeEnabled();
  });

  test('時間枠セレクトボックスの選択肢が正しい', async ({ page }) => {
    const timeframeSelect = page.getByLabel('時間枠');
    await timeframeSelect.click();

    // 各時間枠が表示される
    await expect(page.getByRole('option', { name: '1分足' })).toBeVisible();
    await expect(page.getByRole('option', { name: '5分足' })).toBeVisible();
    await expect(page.getByRole('option', { name: '1時間足' })).toBeVisible();
    await expect(page.getByRole('option', { name: '日足' })).toBeVisible();
  });
});

test.describe('レスポンシブ対応', () => {
  test('モバイル表示でレイアウトが崩れない', async ({ page }) => {
    // モバイルサイズに設定
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // 主要要素が表示される
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByLabel('取引所選択')).toBeVisible();
    await expect(page.getByLabel('ティッカー選択')).toBeVisible();
    await expect(page.getByLabel('時間枠')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'チャート表示エリア' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });

  test('デスクトップ表示でレイアウトが正しい', async ({ page }) => {
    // デスクトップサイズに設定
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // 主要要素が表示される
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByLabel('取引所選択')).toBeVisible();
    await expect(page.getByLabel('ティッカー選択')).toBeVisible();
    await expect(page.getByLabel('時間枠')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'チャート表示エリア' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });
});
