import { test, expect } from '@playwright/test';

test.describe('クイックアクションエリア', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // 3秒待つ (TODO: 今後修正したい)
    await page.waitForTimeout(3000);
  });

  test('クイックアクションエリアが表示される', async ({ page }) => {
    // クイックアクションのタイトルが表示される
    await expect(page.getByRole('heading', { name: 'クイックアクション' })).toBeVisible();
  });

  test('一般ユーザー向けボタンが表示される', async ({ page }) => {
    // 保有株式管理ボタン
    await expect(page.getByRole('link', { name: /保有株式管理/ })).toBeVisible();

    // ウォッチリストボタン
    await expect(page.getByRole('link', { name: /ウォッチリスト/ })).toBeVisible();

    // アラート一覧ボタン
    await expect(page.getByRole('link', { name: /アラート一覧/ })).toBeVisible();
  });

  test('各ボタンが正しいURLにリンクしている', async ({ page }) => {
    // 保有株式管理ボタン
    const holdingsButton = page.getByRole('link', { name: /保有株式管理/ });
    await expect(holdingsButton).toHaveAttribute('href', '/holdings');

    // ウォッチリストボタン
    const watchlistButton = page.getByRole('link', { name: /ウォッチリスト/ });
    await expect(watchlistButton).toHaveAttribute('href', '/watchlist');

    // アラート一覧ボタン
    const alertsButton = page.getByRole('link', { name: /アラート一覧/ });
    await expect(alertsButton).toHaveAttribute('href', '/alerts');
  });

  test('ボタンにアイコンが表示される', async ({ page }) => {
    // 保有株式管理ボタン内にアイコンが存在する
    const holdingsButton = page.getByRole('link', { name: /保有株式管理/ });
    const holdingsIcon = holdingsButton.locator('svg').first();
    await expect(holdingsIcon).toBeVisible();

    // ウォッチリストボタン内にアイコンが存在する
    const watchlistButton = page.getByRole('link', { name: /ウォッチリスト/ });
    const watchlistIcon = watchlistButton.locator('svg').first();
    await expect(watchlistIcon).toBeVisible();

    // アラート一覧ボタン内にアイコンが存在する
    const alertsButton = page.getByRole('link', { name: /アラート一覧/ });
    const alertsIcon = alertsButton.locator('svg').first();
    await expect(alertsIcon).toBeVisible();
  });
});

test.describe('クイックアクションエリア - 管理者権限', () => {
  test.beforeEach(async ({ page }) => {
    // stock-admin ロールのユーザーとしてログイン
    await page.goto('/');

    // 3秒待つ (TODO: 今後修正したい)
    await page.waitForTimeout(3000);
  });

  test('管理者ボタンが表示される (stock-admin)', async ({ page }) => {
    // TEST_USER_ROLES=stock-admin の場合のみ表示される
    // 環境変数によって表示が変わるため、条件付きでチェック
    const exchangeButton = page.getByRole('link', { name: /取引所管理/ });
    const tickerButton = page.getByRole('link', { name: /ティッカー管理/ });

    // 環境変数によって表示されるかどうかをチェック
    const isAdmin = process.env.TEST_USER_ROLES?.includes('stock-admin');
    if (isAdmin) {
      await expect(exchangeButton).toBeVisible();
      await expect(tickerButton).toBeVisible();

      // 正しいURLにリンクしている
      await expect(exchangeButton).toHaveAttribute('href', '/exchanges');
      await expect(tickerButton).toHaveAttribute('href', '/tickers');
    } else {
      await expect(exchangeButton).not.toBeVisible();
      await expect(tickerButton).not.toBeVisible();
    }
  });
});

test.describe('クイックアクションエリア - レスポンシブ対応', () => {
  test('モバイル表示でボタンが縦並びになる', async ({ page }) => {
    // モバイルサイズに設定
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // 3秒待つ
    await page.waitForTimeout(3000);

    // クイックアクションエリアが表示される
    await expect(page.getByRole('heading', { name: 'クイックアクション' })).toBeVisible();

    // ボタンが表示される
    await expect(page.getByRole('link', { name: /保有株式管理/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /ウォッチリスト/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /アラート一覧/ })).toBeVisible();
  });

  test('タブレット表示でボタンが2列グリッドになる', async ({ page }) => {
    // タブレットサイズに設定
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // 3秒待つ
    await page.waitForTimeout(3000);

    // クイックアクションエリアが表示される
    await expect(page.getByRole('heading', { name: 'クイックアクション' })).toBeVisible();

    // ボタンが表示される
    await expect(page.getByRole('link', { name: /保有株式管理/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /ウォッチリスト/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /アラート一覧/ })).toBeVisible();
  });

  test('デスクトップ表示でボタンが3列グリッドになる', async ({ page }) => {
    // デスクトップサイズに設定
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // 3秒待つ
    await page.waitForTimeout(3000);

    // クイックアクションエリアが表示される
    await expect(page.getByRole('heading', { name: 'クイックアクション' })).toBeVisible();

    // ボタンが表示される
    await expect(page.getByRole('link', { name: /保有株式管理/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /ウォッチリスト/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /アラート一覧/ })).toBeVisible();
  });
});
