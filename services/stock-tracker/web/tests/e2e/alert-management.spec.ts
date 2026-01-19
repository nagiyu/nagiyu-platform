/**
 * E2E-002: Alert Management Flow Test
 *
 * アラート管理画面のE2Eテスト
 * - アラート一覧表示
 * - アラート編集（条件値・有効/無効の変更）
 * - アラート削除
 * - Holding/Watchlist からの遷移（クエリパラメータによる自動モーダル表示）
 *
 * Target Device: chromium-mobile (Fast CI), chromium-desktop + webkit-mobile (Full CI)
 */

import { test, expect } from '@playwright/test';

// テストデータ
const TEST_EXCHANGE = {
  exchangeId: 'TEST-EXCHANGE-ALERT',
  name: 'Test Exchange for Alert',
  key: 'TALERT',
  timezone: 'America/New_York',
  start: '09:30',
  end: '16:00',
};

const TEST_TICKER = {
  tickerId: 'TALERT:TEST',
  symbol: 'TEST',
  name: 'Test Ticker for Alert',
  exchangeId: TEST_EXCHANGE.exchangeId,
};

const TEST_HOLDING = {
  tickerId: TEST_TICKER.tickerId,
  exchangeId: TEST_EXCHANGE.exchangeId,
  quantity: 100,
  averagePrice: 150.0,
  currency: 'USD',
};

const TEST_ALERT = {
  tickerId: TEST_TICKER.tickerId,
  exchangeId: TEST_EXCHANGE.exchangeId,
  mode: 'Sell',
  frequency: 'HOURLY_LEVEL',
  conditions: [
    {
      field: 'price',
      operator: 'gte',
      value: 200.0,
    },
  ],
  enabled: true,
  subscription: {
    endpoint: 'https://test.example.com/push',
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-secret',
    },
  },
};

// Playwright Request 型定義
interface PlaywrightRequest {
  get: (url: string) => Promise<{
    ok: () => boolean;
    json: () => Promise<{ alerts?: unknown[]; holdings?: unknown[] }>;
  }>;
  delete: (url: string) => Promise<unknown>;
}

// テストデータクリーンアップ用ヘルパー
async function cleanupTestData(request: PlaywrightRequest) {
  // アラート一覧を取得して削除
  const alertsResponse = await request.get('/api/alerts');
  if (alertsResponse.ok()) {
    const alertsData = await alertsResponse.json();
    const alerts = alertsData.alerts || [];

    for (const alert of alerts) {
      if (alert.tickerId === TEST_TICKER.tickerId) {
        await request.delete(`/api/alerts/${alert.alertId}`);
      }
    }
  }

  // Holdingを削除
  const holdingsResponse = await request.get('/api/holdings');
  if (holdingsResponse.ok()) {
    const holdingsData = await holdingsResponse.json();
    const holdings = holdingsData.holdings || [];

    for (const holding of holdings) {
      if (holding.tickerId === TEST_TICKER.tickerId) {
        await request.delete(`/api/holdings/${holding.holdingId}`);
      }
    }
  }

  // ティッカーを削除
  await request.delete(`/api/tickers/${encodeURIComponent(TEST_TICKER.tickerId)}`);

  // 取引所を削除
  await request.delete(`/api/exchanges/${encodeURIComponent(TEST_EXCHANGE.exchangeId)}`);
}

test.describe('Alert Management Flow', () => {
  test.beforeEach(async ({ page, request, context }) => {
    // 通知許可を自動付与
    await context.grantPermissions(['notifications']);

    // テストデータをクリーンアップ
    await cleanupTestData(request);

    // テストデータを作成
    // 1. 取引所を作成
    await request.post('/api/exchanges', {
      data: TEST_EXCHANGE,
    });

    // 2. ティッカーを作成
    await request.post('/api/tickers', {
      data: TEST_TICKER,
    });

    // 3. Holdingを作成
    await request.post('/api/holdings', {
      data: TEST_HOLDING,
    });

    // 4. アラートを作成
    await request.post('/api/alerts', {
      data: TEST_ALERT,
    });

    // アラート一覧画面にアクセス
    await page.goto('/alerts');

    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');

    // アラート管理のヘッダーが表示されるまで待機
    await expect(page.getByRole('heading', { name: 'アラート管理' })).toBeVisible({ timeout: 10000 });

    // テーブルのロード完了を待つ（ローディングスピナーが消えるまで待つ）
    const progressBar = page.locator('[role="progressbar"]');
    const isProgressBarVisible = await progressBar.isVisible().catch(() => false);
    if (isProgressBarVisible) {
      await progressBar.waitFor({ state: 'detached', timeout: 10000 });
    }
  });

  test.afterEach(async ({ request }) => {
    // テストデータをクリーンアップ
    await cleanupTestData(request);
  });

  test('アラート一覧が正しく表示される', async ({ page }) => {
    // アラート一覧タイトルが表示されることを確認
    await expect(page.getByRole('heading', { name: 'アラート一覧' })).toBeVisible();

    // テーブルが表示されることを確認
    await expect(page.getByRole('table', { name: 'アラート一覧' })).toBeVisible();

    // テストアラートが表示されることを確認（タイムアウトを長めに設定）
    await expect(page.getByText(TEST_TICKER.symbol)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(TEST_TICKER.name)).toBeVisible();

    // モードチップが表示されることを確認
    await expect(page.getByText('売り')).toBeVisible();

    // 条件が表示されることを確認
    await expect(page.getByText(/価格 以上 \(>=\) 200/)).toBeVisible();

    // 頻度が表示されることを確認
    await expect(page.getByText('1時間間隔')).toBeVisible();

    // 状態が表示されることを確認（有効）
    await expect(page.getByText('有効')).toBeVisible();
  });

  test('アラートを編集できる', async ({ page }) => {
    // テーブルが表示されるまで待つ
    await expect(page.getByRole('table', { name: 'アラート一覧' })).toBeVisible();
    
    // テストデータが表示されるまで待つ
    await expect(page.getByText(TEST_TICKER.symbol)).toBeVisible({ timeout: 10000 });

    // 編集ボタンをクリック
    await page.getByRole('button', { name: '編集' }).click();

    // 編集モーダルが表示されることを確認
    await expect(page.getByRole('dialog', { name: 'アラートの編集' })).toBeVisible();

    // モードが表示のみで変更不可であることを確認
    const modeField = page.getByLabel('モード');
    await expect(modeField).toBeDisabled();
    await expect(modeField).toHaveValue('売り');

    // ティッカーが表示のみで変更不可であることを確認
    const tickerField = page.getByLabel('ティッカー');
    await expect(tickerField).toBeDisabled();
    await expect(tickerField).toHaveValue(`${TEST_TICKER.symbol} - ${TEST_TICKER.name}`);

    // 目標価格を変更
    const conditionValueField = page.getByLabel('目標価格');
    await expect(conditionValueField).toHaveValue('200');
    await conditionValueField.fill('250.5');

    // 有効/無効を変更
    const enabledSwitch = page.getByLabel('アラートを有効にする');
    await expect(enabledSwitch).toBeChecked();
    await enabledSwitch.click();
    await expect(enabledSwitch).not.toBeChecked();

    // 保存ボタンをクリック
    await page.getByRole('button', { name: '保存' }).click();

    // 成功メッセージが表示されることを確認
    await expect(page.getByText('アラートを更新しました')).toBeVisible({ timeout: 10000 });

    // モーダルが閉じることを確認
    await expect(page.getByRole('dialog', { name: 'アラートの編集' })).not.toBeVisible({ timeout: 5000 });

    // 更新された内容が一覧に反映されることを確認
    await expect(page.getByText(/価格 以上 \(>=\) 250\.5/)).toBeVisible();
    await expect(page.getByText('無効')).toBeVisible();
  });

  test('アラートを削除できる', async ({ page }) => {
    // テーブルが表示されるまで待つ
    await expect(page.getByRole('table', { name: 'アラート一覧' })).toBeVisible();
    
    // テストデータが表示されるまで待つ
    await expect(page.getByText(TEST_TICKER.symbol)).toBeVisible({ timeout: 10000 });

    // 削除ボタンをクリック
    await page.getByRole('button', { name: '削除' }).click();

    // 削除確認ダイアログが表示されることを確認
    await expect(page.getByRole('dialog', { name: 'アラートの削除' })).toBeVisible();

    // 確認メッセージが表示されることを確認
    await expect(page.getByText('以下のアラートを削除してもよろしいですか？')).toBeVisible();

    // アラート情報が表示されることを確認
    await expect(page.getByText(/モード:.*売り/)).toBeVisible();
    await expect(page.getByText(new RegExp(`ティッカー:.*${TEST_TICKER.symbol}`))).toBeVisible();

    // 削除ボタンをクリック
    await page.getByRole('button', { name: '削除', exact: true }).click();

    // 成功メッセージが表示されることを確認
    await expect(page.getByText('アラートを削除しました')).toBeVisible({ timeout: 10000 });

    // ダイアログが閉じることを確認
    await expect(page.getByRole('dialog', { name: 'アラートの削除' })).not.toBeVisible({ timeout: 5000 });

    // アラートが一覧から削除されたことを確認
    await expect(page.getByText(TEST_TICKER.symbol)).not.toBeVisible();
    await expect(page.getByText('アラートがありません')).toBeVisible();
  });

  test('キャンセルボタンでモーダルを閉じることができる', async ({ page }) => {
    // テーブルが表示されるまで待つ
    await expect(page.getByRole('table', { name: 'アラート一覧' })).toBeVisible();
    
    // テストデータが表示されるまで待つ
    await expect(page.getByText(TEST_TICKER.symbol)).toBeVisible({ timeout: 10000 });

    // 編集ボタンをクリック
    await page.getByRole('button', { name: '編集' }).click();

    // 編集モーダルが表示されることを確認
    await expect(page.getByRole('dialog', { name: 'アラートの編集' })).toBeVisible();

    // キャンセルボタンをクリック
    await page.getByRole('button', { name: 'キャンセル' }).first().click();

    // モーダルが閉じることを確認
    await expect(page.getByRole('dialog', { name: 'アラートの編集' })).not.toBeVisible({ timeout: 5000 });

    // 元のデータが保持されていることを確認
    await expect(page.getByText(/価格 以上 \(>=\) 200/)).toBeVisible();
  });

  test('バリデーションエラーが正しく表示される', async ({ page }) => {
    // テーブルが表示されるまで待つ
    await expect(page.getByRole('table', { name: 'アラート一覧' })).toBeVisible();
    
    // テストデータが表示されるまで待つ
    await expect(page.getByText(TEST_TICKER.symbol)).toBeVisible({ timeout: 10000 });

    // 編集ボタンをクリック
    await page.getByRole('button', { name: '編集' }).click();

    // 編集モーダルが表示されることを確認
    await expect(page.getByRole('dialog', { name: 'アラートの編集' })).toBeVisible();

    // 目標価格を無効な値に変更
    const conditionValueField = page.getByLabel('目標価格');
    await conditionValueField.fill('');

    // 保存ボタンをクリック
    await page.getByRole('button', { name: '保存' }).click();

    // バリデーションエラーが表示されることを確認
    await expect(page.getByText('この項目は必須です')).toBeVisible();

    // モーダルが閉じないことを確認
    await expect(page.getByRole('dialog', { name: 'アラートの編集' })).toBeVisible();

    // 範囲外の値でテスト
    await conditionValueField.fill('2000000');

    // 保存ボタンをクリック
    await page.getByRole('button', { name: '保存' }).click();

    // バリデーションエラーが表示されることを確認
    await expect(
      page.getByText('目標価格は0.01以上、1,000,000以下で入力してください')
    ).toBeVisible();
  });

  test('Holdingからアラート一覧画面に遷移できる（クエリパラメータ）', async ({ page }) => {
    // Holding画面にアクセス
    await page.goto('/holdings');
    await page.waitForLoadState('networkidle');

    // テーブルが表示されるまで待つ
    await expect(page.getByRole('table', { name: '保有株式一覧' })).toBeVisible();

    // テストデータが表示されることを確認
    await expect(page.getByText(TEST_TICKER.symbol)).toBeVisible();

    // アラートボタンを探して クリック
    // アラート設定済みの場合は「アラート設定済」、未設定の場合は「売りアラート」が表示される
    const alertSetButton = page.getByRole('button', { name: 'アラート設定済' });
    const sellAlertButton = page.getByRole('button', { name: '売りアラート' });
    
    const isAlertSet = await alertSetButton.isVisible().catch(() => false);
    const alertButton = isAlertSet ? alertSetButton : sellAlertButton;
    
    await expect(alertButton).toBeVisible({ timeout: 10000 });
    await alertButton.click();

    // アラート一覧画面に遷移することを確認
    await expect(page).toHaveURL(/\/alerts/);

    // アラート一覧画面が表示されることを確認
    await expect(page.getByRole('heading', { name: 'アラート管理' })).toBeVisible();
  });
});
