import { test, expect, resetState, type ResetSeedData } from './fixtures';

// 実 Service Worker が API 応答を仲介しないようにする (他のスペックと同じ理由)
test.use({ serviceWorkers: 'block' });

/**
 * ロールに応じた操作の出し分け
 *
 * 権限の無い操作はボタンごと出さないこと、管理画面は権限エラーになることを、
 * ロールを固定して確かめる。`resetState` は共有ストアを消すため、ファイル内を直列にする。
 */
test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ playwright }) => {
  const context = await playwright.request.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });
  await resetState(context);
  await context.dispose();
});

// SKIP_AUTH_CHECK=true 環境で使用される固定のユーザーID
const TEST_USER_ID = 'test-user-id';
const EXCHANGE_ID = 'E2E-ROLE-EX';
const EXCHANGE_KEY = 'E2EROLE';
const EXCHANGE_NAME = 'E2E Role Test Exchange';
const TICKER_SYMBOL = 'ROLETK';
const TICKER_ID = `${EXCHANGE_KEY}:${TICKER_SYMBOL}`;

const DUMMY_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-role-test-subscription',
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
} as const;

function seed(): ResetSeedData {
  return {
    exchanges: [
      {
        exchangeId: EXCHANGE_ID,
        name: EXCHANGE_NAME,
        key: EXCHANGE_KEY,
        timezone: 'America/New_York',
        start: '09:30',
        end: '16:00',
        priceSource: 'tradingview',
        market: 'US',
      },
    ],
    tickers: [
      {
        tickerId: TICKER_ID,
        symbol: TICKER_SYMBOL,
        name: 'E2E Role Test Ticker',
        exchangeId: EXCHANGE_ID,
      },
    ],
    holdings: [
      {
        userId: TEST_USER_ID,
        tickerId: TICKER_ID,
        exchangeId: EXCHANGE_ID,
        quantity: 10,
        averagePrice: 100,
        currency: 'USD',
      },
    ],
    alerts: [
      {
        userId: TEST_USER_ID,
        tickerId: TICKER_ID,
        exchangeId: EXCHANGE_ID,
        mode: 'Sell' as const,
        frequency: 'MINUTE_LEVEL' as const,
        enabled: true,
        conditionList: [{ field: 'price' as const, operator: 'gte' as const, value: 150 }],
        subscription: DUMMY_SUBSCRIPTION,
      },
    ],
  };
}

test.beforeEach(async ({ request }) => {
  await resetState(request, seed());
});

test.describe('stock-viewer: 書き込み操作を出さない', () => {
  test.use({ role: ['stock-viewer'] });

  test('保有株式管理画面に登録・アラート・編集・削除の操作が出ない', async ({ page }) => {
    await page.goto('/holdings');
    await expect(page.getByRole('cell', { name: TICKER_SYMBOL })).toBeVisible();

    await expect(page.getByRole('button', { name: /新規登録/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /売りアラート|アラート設定済/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /編集/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /削除/ })).toHaveCount(0);
  });

  test('アラート一覧画面に編集・削除の操作が出ない', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByRole('cell', { name: TICKER_SYMBOL })).toBeVisible();

    await expect(page.getByRole('button', { name: /編集/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /削除/ })).toHaveCount(0);
  });

  test('トップ画面の保有株式・アラートに追加・編集・削除の操作が出ない', async ({ page }) => {
    await page.goto(
      `/?exchangeId=${encodeURIComponent(EXCHANGE_ID)}&tickerId=${encodeURIComponent(TICKER_ID)}`
    );
    await expect(page.getByText('保有数量: 10')).toBeVisible();
    await expect(page.getByText('以上 150')).toBeVisible();

    await expect(page.getByRole('button', { name: '追加', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '買い追加' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '売り追加' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '編集' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '削除' })).toHaveCount(0);
  });

  test('取引所管理画面は権限エラーになる', async ({ page }) => {
    await page.goto('/exchanges');
    await expect(page.getByText('取引所を管理する権限がありません。')).toBeVisible();
    await expect(page.getByRole('button', { name: /新規作成|追加/ })).toHaveCount(0);
  });
});

test.describe('stock-user: 管理画面は権限エラーだが自分のデータは操作できる', () => {
  test.use({ role: ['stock-user'] });

  test('取引所管理画面は権限エラーになる', async ({ page }) => {
    await page.goto('/exchanges');
    await expect(page.getByText('権限エラー')).toBeVisible();
    await expect(page.getByText('取引所を管理する権限がありません。')).toBeVisible();
    await expect(page.getByText(EXCHANGE_NAME)).toHaveCount(0);
  });

  test('ティッカー管理画面は権限エラーになる', async ({ page }) => {
    await page.goto('/tickers');
    await expect(page.getByText('権限エラー')).toBeVisible();
    await expect(page.getByText('ティッカーを管理する権限がありません。')).toBeVisible();
    await expect(page.getByText(TICKER_SYMBOL)).toHaveCount(0);
  });

  test('保有株式管理画面で登録・編集・削除の操作が出る', async ({ page }) => {
    await page.goto('/holdings');
    await expect(page.getByRole('cell', { name: TICKER_SYMBOL })).toBeVisible();

    await expect(page.getByRole('button', { name: /新規登録/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /編集/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /削除/ })).toBeVisible();
  });

  test('アラート一覧画面で編集・削除の操作が出る', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByRole('cell', { name: TICKER_SYMBOL })).toBeVisible();

    await expect(page.getByRole('button', { name: /編集/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /削除/ })).toBeVisible();
  });
});

test.describe('stock-admin: 従来どおり操作できる', () => {
  test.use({ role: ['stock-admin'] });

  test('取引所管理画面に一覧と操作が出る', async ({ page }) => {
    await page.goto('/exchanges');
    await expect(page.getByText(EXCHANGE_NAME)).toBeVisible();
    await expect(page.getByText('権限エラー')).toHaveCount(0);
  });

  test('ティッカー管理画面に一覧と操作が出る', async ({ page }) => {
    await page.goto('/tickers');
    await expect(page.getByText('権限エラー')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /ティッカー/ }).first()).toBeVisible();
  });

  test('保有株式管理画面で登録・編集・削除の操作が出る', async ({ page }) => {
    await page.goto('/holdings');
    await expect(page.getByRole('cell', { name: TICKER_SYMBOL })).toBeVisible();

    await expect(page.getByRole('button', { name: /新規登録/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /編集/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /削除/ })).toBeVisible();
  });
});
