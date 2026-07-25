import { test, expect, resetState, type ResetSeedData } from './fixtures';

/**
 * webkit-mobile 対応: 実 Service Worker（/sw.js）を無効化する。
 *
 * 本アプリは libs/ui の ServiceWorkerRegistration が全ページで /sw.js を登録するため、
 * webkit では SW がページを制御し、API 応答を仲介・キャッシュしてしまう。Playwright は
 * 「Service Worker 経由のリクエストは Chromium 以外では page.route で捕捉できない」
 * という既知の制約があるため、モックが素通りしたり、UI が古い応答を表示したりして
 * テストが非決定的になる（実測で確認済み）。
 *
 * `chromium-mobile` プロジェクトは playwright.config.base.ts 側で
 * `serviceWorkers: 'block'` を設定済みだが、`chromium-desktop` / `webkit-mobile` は
 * 未設定という非対称があるため、本サービスの spec 側で一律に打ち消す。
 * （設定の非対称そのものの解消は E2E 横断整備の範囲と判断し、本対応では触れない。）
 */
test.use({ serviceWorkers: 'block' });

/**
 * E2E-003: Holding 管理フロー
 *
 * このテストは以下を検証します:
 * - 保有株式の登録（CRUD操作の Create）
 * - 保有株式の更新（CRUD操作の Update）
 * - 保有株式の削除（CRUD操作の Delete、売りアラートの連動削除を含む）
 * - バリデーションエラーの表示
 * - レスポンシブ対応
 *
 * `resetState` でインメモリリポジトリを都度リセット・seed することで、前提となる
 * 取引所・ティッカー・保有株式・アラートを決定的に用意し、1 テスト = 1 結末で assert する。
 * 旧実装にあった「エラーが表示されたらキャンセルして続行」「モーダルが閉じていなければ
 * バリデーションエラーを探し、それも無ければタイミング問題としてログ出力」のような
 * 全結末を飲み込む条件分岐・console.log によるデバッグ出力は行わない。
 *
 * `resetState` はサービス全体のインメモリストアを消す破壊的操作であり、Playwright は
 * ファイル間も並列実行するため、他ファイルの実行と鉢合わせるとデータを巻き込む恐れがある。
 * そのため本ファイルはファイル全体を `test.describe.configure({ mode: 'serial' })` で
 * 直列化し、同一ファイル内での競合を防ぐ。
 *
 * ただし `mode: 'serial'` が直列化するのは同一ファイル内だけで、ファイル間の並列は防げない。
 * ファイル間の巻き込みは `playwright.config.base.ts` の `workers: isCI ? 1 : undefined` に
 * 依存しており、CI（workers=1）でのみ安全である。ローカルで実行するときは `--workers=1` を
 * 付けること（付けない場合、本ファイルの resetState が他ファイルのデータを消しうる）。
 *
 * また、本ファイルの最後の beforeEach が残した seed データ（取引所・ティッカー等）が
 * 後続で実行される他ファイル（resetState を使わず、実行順に依存して蓄積データを前提とする
 * テスト）を汚染しないよう、全テスト終了後に afterAll でストアを空の状態へ戻す。
 */
test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ playwright }) => {
  const context = await playwright.request.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });
  await resetState(context);
  await context.dispose();
});

// SKIP_AUTH_CHECK=true 環境で使用される固定のユーザーID（lib/auth.ts の getSession() 参照）
const TEST_USER_ID = 'test-user-id';

const EXCHANGE_ID = 'E2E-HOLD-EX';
const EXCHANGE_KEY = 'E2EHOLD';
const EXCHANGE_NAME = 'E2E Holding Test Exchange';

const TICKER_SYMBOL = 'HOLDTK';
const TICKER_ID = `${EXCHANGE_KEY}:${TICKER_SYMBOL}`;
const TICKER_NAME = 'E2E Holding Test Ticker';

// Web Push サブスクリプションのダミー値（このテストでは実際の通知は発生しないため固定値でよい）
const DUMMY_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-holding-test-subscription',
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
} as const;

/** 前提となる取引所・ティッカーの seed データ（本ファイル全テスト共通） */
function baseSeed(): ResetSeedData {
  return {
    exchanges: [
      {
        ExchangeID: EXCHANGE_ID,
        Name: EXCHANGE_NAME,
        Key: EXCHANGE_KEY,
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        PriceSource: 'tradingview',
      },
    ],
    tickers: [
      {
        TickerID: TICKER_ID,
        Symbol: TICKER_SYMBOL,
        Name: TICKER_NAME,
        ExchangeID: EXCHANGE_ID,
      },
    ],
  };
}

/** 保有株式 seed データ */
function holdingSeed(overrides: { quantity?: number; averagePrice?: number } = {}) {
  return {
    UserID: TEST_USER_ID,
    TickerID: TICKER_ID,
    ExchangeID: EXCHANGE_ID,
    Quantity: overrides.quantity ?? 50,
    AveragePrice: overrides.averagePrice ?? 120,
    Currency: 'USD',
  };
}

/** 売りアラート seed データ */
function sellAlertSeed(value: number) {
  return {
    UserID: TEST_USER_ID,
    TickerID: TICKER_ID,
    ExchangeID: EXCHANGE_ID,
    Mode: 'Sell' as const,
    Frequency: 'MINUTE_LEVEL' as const,
    Enabled: true,
    ConditionList: [{ field: 'price' as const, operator: 'gte' as const, value }],
    subscription: DUMMY_SUBSCRIPTION,
  };
}

/** 買いアラート seed データ */
function buyAlertSeed(value: number) {
  return {
    UserID: TEST_USER_ID,
    TickerID: TICKER_ID,
    ExchangeID: EXCHANGE_ID,
    Mode: 'Buy' as const,
    Frequency: 'MINUTE_LEVEL' as const,
    Enabled: true,
    ConditionList: [{ field: 'price' as const, operator: 'lte' as const, value }],
    subscription: DUMMY_SUBSCRIPTION,
  };
}

test.describe('Holding 管理フロー (E2E-003)', () => {
  test.describe('画面表示・登録', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, baseSeed());
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
    });

    test('保有株式管理画面が正しく表示される', async ({ page }) => {
      await expect(page.getByRole('heading', { name: '保有株式管理' })).toBeVisible();
      await expect(page.getByRole('button', { name: /新規登録/ })).toBeVisible();
      await expect(page.getByRole('heading', { name: '保有株式一覧' })).toBeVisible();

      await expect(page.getByRole('columnheader', { name: '取引所' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'ティッカー' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '保有数' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '平均取得価格' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '通貨' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'アラート' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '操作' })).toBeVisible();
    });

    test('新規登録モーダルが正しく動作する', async ({ page }) => {
      await page.getByRole('button', { name: /新規登録/ }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: '保有株式の登録' })).toBeVisible();

      await expect(page.getByLabel('取引所')).toBeVisible();
      await expect(page.getByLabel('ティッカー')).toBeVisible();
      await expect(page.getByLabel('保有数')).toBeVisible();
      await expect(page.getByLabel('平均取得価格')).toBeVisible();
      await expect(page.getByLabel('通貨')).toBeVisible();

      await expect(page.getByRole('button', { name: 'キャンセル' })).toBeVisible();
      await expect(page.getByRole('button', { name: '保存' })).toBeVisible();

      await page.getByRole('button', { name: 'キャンセル' }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });

    test('保有株式の登録ができる', async ({ page }) => {
      await page.getByRole('button', { name: /新規登録/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 前提の取引所・ティッカーは resetState で確実に seed済みのため、選択は決定的に成功する
      await page.locator('#create-exchange').selectOption({ label: EXCHANGE_NAME });

      const tickerSelect = page.locator('#create-ticker');
      await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
      await tickerSelect.selectOption(TICKER_ID);

      await page.locator('#create-quantity').fill('100');
      await page.locator('#create-average-price').fill('150.50');
      // 通貨はデフォルトの USD のまま

      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByText('保有株式を登録しました')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('dialog')).not.toBeVisible();

      const row = page.getByRole('row').filter({ hasText: TICKER_SYMBOL });
      await expect(row).toBeVisible();
      await expect(row.getByRole('button', { name: '削除' })).toBeVisible();
    });

    test('数値入力欄でエンターキーを押すと登録処理が実行される', async ({ page }) => {
      await page.getByRole('button', { name: /新規登録/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await page.locator('#create-exchange').selectOption({ label: EXCHANGE_NAME });

      const tickerSelect = page.locator('#create-ticker');
      await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
      await tickerSelect.selectOption(TICKER_ID);

      await page.locator('#create-quantity').fill('100');
      await page.locator('#create-average-price').fill('150.50');

      // 登録ボタンをクリックせず、数値入力欄（平均取得価格）でエンターキーを押す
      await page.locator('#create-average-price').press('Enter');

      await expect(page.getByText('保有株式を登録しました')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('dialog')).not.toBeVisible();

      const row = page.getByRole('row').filter({ hasText: TICKER_SYMBOL });
      await expect(row).toBeVisible();
    });

    test('バリデーションエラーが正しく表示される', async ({ page }) => {
      await page.getByRole('button', { name: /新規登録/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 何も入力せずに保存ボタンをクリック
      await page.getByRole('button', { name: '保存' }).click();

      // エラーメッセージが表示される（複数フィールドで同じメッセージが表示される可能性があるため、.first()を使用）
      await expect(page.getByText('この項目は必須です').first()).toBeVisible();

      // 不正な数値を入力
      await page.locator('#create-quantity').fill('-1');
      await page.locator('#create-average-price').fill('0');

      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByText(/保有数は0\.0001以上/)).toBeVisible();
      await expect(page.getByText(/平均取得価格は0\.01以上/)).toBeVisible();
    });
  });

  test.describe('保有株式の編集', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, {
        ...baseSeed(),
        holdings: [holdingSeed({ quantity: 100, averagePrice: 150.0 })],
      });
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
    });

    test('保有株式の編集ができる', async ({ page }) => {
      await expect(page.getByText(TICKER_SYMBOL, { exact: true })).toBeVisible({ timeout: 10000 });

      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await targetRow.getByRole('button', { name: '編集' }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: '保有株式の編集' })).toBeVisible();

      // 取引所とティッカーは読み取り専用
      await expect(page.getByLabel('取引所')).toBeDisabled();
      await expect(page.getByLabel('ティッカー')).toBeDisabled();

      const quantityInput = page.locator('#edit-quantity');
      await quantityInput.clear();
      await quantityInput.fill('200');

      const averagePriceInput = page.locator('#edit-average-price');
      await averagePriceInput.clear();
      await averagePriceInput.fill('155.75');

      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
      await expect(page.getByText('保有株式を更新しました')).toBeVisible({ timeout: 5000 });

      const updatedRow = page.getByRole('row').filter({ hasText: TICKER_SYMBOL });
      await expect(updatedRow.getByText('200')).toBeVisible();
      await expect(updatedRow.getByText('155.75 USD')).toBeVisible();
    });
  });

  test.describe('保有株式の削除', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, {
        ...baseSeed(),
        holdings: [holdingSeed()],
      });
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
    });

    test('保有株式の削除ができる', async ({ page }) => {
      const row = page.getByRole('row').filter({ hasText: TICKER_SYMBOL });
      await expect(row).toBeVisible();

      await row.getByRole('button', { name: '削除' }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: '保有株式の削除' })).toBeVisible();
      await expect(page.getByText(/以下の保有株式を削除してもよろしいですか/)).toBeVisible();

      await page.getByRole('button', { name: '削除' }).last().click();

      await expect(page.getByText('保有株式を削除しました')).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('dialog')).not.toBeVisible();

      await expect(page.getByRole('row').filter({ hasText: TICKER_SYMBOL })).not.toBeVisible();
    });
  });

  test.describe('保有株式の削除（売りアラートあり）', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, {
        ...baseSeed(),
        holdings: [holdingSeed()],
        alerts: [sellAlertSeed(180), buyAlertSeed(90)],
      });
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
    });

    test('保有株式削除ダイアログで売りアラートが表示され、削除時に売りアラートも削除される', async ({
      page,
      request,
    }) => {
      const alertsBeforeResponse = await request.get('/api/alerts');
      expect(alertsBeforeResponse.ok()).toBeTruthy();
      const alertsBefore = (await alertsBeforeResponse.json()).alerts as Array<{
        alertId: string;
        mode: string;
      }>;
      const sellAlert = alertsBefore.find((alert) => alert.mode === 'Sell');
      const buyAlert = alertsBefore.find((alert) => alert.mode === 'Buy');
      expect(sellAlert).toBeDefined();
      expect(buyAlert).toBeDefined();

      const row = page.getByRole('row').filter({ hasText: TICKER_SYMBOL });
      await row.getByRole('button', { name: '削除' }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('以下の売りアラートも合わせて削除されます。')).toBeVisible();
      await expect(page.getByText(`${TICKER_SYMBOL}（価格 180 以上）`)).toBeVisible();

      await page.getByRole('button', { name: '削除' }).last().click();
      await expect(page.getByText('保有株式を削除しました')).toBeVisible({ timeout: 5000 });

      const alertsAfterResponse = await request.get('/api/alerts');
      expect(alertsAfterResponse.ok()).toBeTruthy();
      const alertsAfter = (await alertsAfterResponse.json()).alerts as Array<{ alertId: string }>;
      const remainingAlertIds = alertsAfter.map((alert) => alert.alertId);

      expect(remainingAlertIds).not.toContain(sellAlert!.alertId);
      expect(remainingAlertIds).toContain(buyAlert!.alertId);
    });
  });

  test.describe('アラート設定ボタン', () => {
    test.describe('アラートが未設定の場合', () => {
      test.beforeEach(async ({ page, request }) => {
        await resetState(request, {
          ...baseSeed(),
          holdings: [holdingSeed()],
        });
        await page.goto('/holdings');
        await page.waitForLoadState('networkidle');
      });

      test('売りアラートボタンが表示される', async ({ page }) => {
        const row = page.getByRole('row').filter({ hasText: TICKER_SYMBOL });
        await expect(row.getByRole('button', { name: '売りアラート' })).toBeVisible();
        await expect(row.getByRole('button', { name: 'アラート設定済' })).not.toBeVisible();
      });
    });

    test.describe('売りアラートが設定済みの場合', () => {
      test.beforeEach(async ({ page, request }) => {
        await resetState(request, {
          ...baseSeed(),
          holdings: [holdingSeed()],
          alerts: [sellAlertSeed(180)],
        });
        await page.goto('/holdings');
        await page.waitForLoadState('networkidle');
      });

      test('アラート設定済ボタンが表示される', async ({ page }) => {
        const row = page.getByRole('row').filter({ hasText: TICKER_SYMBOL });
        await expect(row.getByRole('button', { name: 'アラート設定済' })).toBeVisible();
      });
    });
  });

  test.describe('画面遷移・レスポンシブ', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, baseSeed());
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
    });

    test('戻るボタンで前の画面に戻れる', async ({ page }) => {
      await page.getByRole('button', { name: '戻る' }).click();

      await page.waitForURL('/');
      expect(page.url()).toContain('/');
    });

    test('レスポンシブデザインが動作する (モバイル)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await expect(page.getByRole('heading', { name: '保有株式管理' })).toBeVisible();
      await expect(page.getByRole('button', { name: /新規登録/ })).toBeVisible();
      await expect(page.getByRole('table')).toBeVisible();

      await page.getByRole('button', { name: /新規登録/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const formFields = page.locator('.MuiDialogContent-root').locator('.MuiBox-root > *');
      const formFieldsCount = await formFields.count();
      expect(formFieldsCount).toBeGreaterThan(0);

      await page.getByRole('button', { name: 'キャンセル' }).click();
    });
  });
});
