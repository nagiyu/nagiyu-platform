import { test, expect, resetState, type ResetSeedData } from './fixtures';

/**
 * E2E-001: チャート表示フロー / E2E-008: チャート自動更新
 *
 * このテストは以下を検証します:
 * - 取引所・ティッカー選択 → チャート表示
 * - 時間枠・表示本数切り替え
 * - チャート表示エリアのレスポンシブ対応
 * - API エラー時にエラーメッセージが表示される
 * - 自動更新を有効にすると一定間隔でチャートデータが再取得される
 *
 * チャートデータは TradingView API（外部サービス）由来であり、E2E 実行環境からは
 * 疎通できない（このリポジトリのテスト環境では接続自体が失敗する）。旧実装は実際に
 * TradingView へ到達させたうえで「チャートまたはエラーのいずれかが表示される」ことだけを
 * assert しており、外部サービスの可用性に応じてどちらに転んでも成功する形骸化テストだった。
 * 本ファイルでは `/api/chart/**` を `page.route` で固定応答に差し替えることで TradingView への
 * 依存を断ち切り、「チャートが表示される」テストと「API エラー時にエラーメッセージが
 * 表示される」テストを別々の決定的なテストとして分離する。
 *
 * 取引所・ティッカーは `resetState` でインメモリリポジトリに決定的に seed する
 * （他ファイルと同様のパターン）。
 *
 * `resetState` はサービス全体のインメモリストアを消す破壊的操作であり、Playwright は
 * ファイル間も並列実行するため、他ファイルの実行と鉢合わせるとデータを巻き込む恐れがある。
 * そのため本ファイルはファイル全体を `test.describe.configure({ mode: 'serial' })` で
 * 直列化し、全テスト終了後に afterAll でストアを空の状態へ戻す。
 *
 * ただし `mode: 'serial'` が直列化するのは同一ファイル内だけで、ファイル間の並列は防げない。
 * ファイル間の巻き込みは `playwright.config.base.ts` の `workers: isCI ? 1 : undefined` に
 * 依存しており、CI（workers=1）でのみ安全である。ローカルで実行するときは `--workers=1` を
 * 付けること（付けない場合、本ファイルの resetState が他ファイルのデータを消しうる）。
 */
test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ playwright }) => {
  const context = await playwright.request.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });
  await resetState(context);
  await context.dispose();
});

const EXCHANGE_ID = 'E2E-CHART-EX';
const EXCHANGE_KEY = 'E2ECHART';
const EXCHANGE_NAME = 'E2E Chart Test Exchange';

const TICKER_SYMBOL = 'CHARTTK';
const TICKER_ID = `${EXCHANGE_KEY}:${TICKER_SYMBOL}`;
const TICKER_NAME = 'E2E Chart Test Ticker';

// `components/StockChart.tsx` が参照する `lib/constants.ts` の AUTO_REFRESH_INTERVAL_MS と
// 同じ値（10秒）。実装側の定数を変更した場合は本テストの値も追従させること。
const AUTO_REFRESH_INTERVAL_MS = 10_000;

/** 前提となる取引所・ティッカーの seed データ */
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

/** `/api/chart/{tickerId}` の成功応答ボディ（`@nagiyu/stock-tracker-core` の ChartData 相当） */
function buildChartResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tickerId: TICKER_ID,
    symbol: TICKER_SYMBOL,
    timeframe: '60',
    data: [
      { time: 1710000000000, open: 100, high: 110, low: 95, close: 105, volume: 1000000 },
      { time: 1710003600000, open: 105, high: 112, low: 100, close: 108, volume: 1200000 },
    ],
    ...overrides,
  };
}

test.describe('チャート表示機能', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetState(request, baseSeed());

    // TradingView API への実疎通を避け、チャートデータ取得を決定的に成功させる
    await page.route('**/api/chart/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildChartResponse()),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('初期状態ではチャートが表示されない', async ({ page }) => {
    await expect(page.getByText('取引所とティッカーを選択してください')).toBeVisible();
  });

  test('自動更新ボタンの表示とトグル動作が正常に動作する', async ({ page }) => {
    const autoRefreshButton = page.getByRole('button', { name: '自動更新' });
    await expect(autoRefreshButton).toBeVisible();
    await expect(autoRefreshButton).toHaveAttribute('aria-pressed', 'false');

    await page.locator('#exchange-select').selectOption(EXCHANGE_ID);

    const tickerSelect = page.locator('#ticker-select');
    await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
    await tickerSelect.selectOption(TICKER_ID);

    // 自動更新を有効化
    await autoRefreshButton.click();
    await expect(autoRefreshButton).toHaveAttribute('aria-pressed', 'true');

    // 時間枠変更後も自動更新状態を維持する
    await page.locator('#timeframe-select').selectOption('5');
    await expect(autoRefreshButton).toHaveAttribute('aria-pressed', 'true');

    // 再クリックで自動更新を停止
    await autoRefreshButton.click();
    await expect(autoRefreshButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('取引所・ティッカー選択後にチャートが表示される', async ({ page }) => {
    await page.locator('#exchange-select').selectOption(EXCHANGE_ID);

    const tickerSelect = page.locator('#ticker-select');
    await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
    await tickerSelect.selectOption(TICKER_ID);

    await expect(page.getByRole('img', { name: /の株価チャート/ })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('時間枠切り替えが正常に動作する', async ({ page }) => {
    await page.locator('#exchange-select').selectOption(EXCHANGE_ID);

    const tickerSelect = page.locator('#ticker-select');
    await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
    await tickerSelect.selectOption(TICKER_ID);

    await expect(page.getByRole('img', { name: /の株価チャート/ })).toBeVisible({
      timeout: 10000,
    });

    // 時間枠を変更（'1' → '5'）してもチャートが表示され続けることを確認する
    await page.locator('#timeframe-select').selectOption('5');
    await expect(page.getByRole('img', { name: /の株価チャート/ })).toBeVisible({
      timeout: 10000,
    });
  });

  test('表示本数切り替えが正常に動作する', async ({ page }) => {
    await page.locator('#exchange-select').selectOption(EXCHANGE_ID);

    const tickerSelect = page.locator('#ticker-select');
    await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
    await tickerSelect.selectOption(TICKER_ID);

    await expect(page.getByRole('img', { name: /の株価チャート/ })).toBeVisible({
      timeout: 10000,
    });

    const barCountSelect = page.locator('#barcount-select');
    await expect(barCountSelect).toBeVisible();
    await expect(barCountSelect).toHaveValue('100');

    // 表示本数を変更（'100' → '10'）してもチャートが表示され続けることを確認する
    await barCountSelect.selectOption('10');
    await expect(page.getByRole('img', { name: /の株価チャート/ })).toBeVisible({
      timeout: 10000,
    });
  });

  test('チャート表示エリアがレスポンシブである', async ({ page }) => {
    await page.locator('#exchange-select').selectOption(EXCHANGE_ID);

    const tickerSelect = page.locator('#ticker-select');
    await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
    await tickerSelect.selectOption(TICKER_ID);

    const chartArea = page.getByRole('img', { name: /の株価チャート/ });
    await expect(chartArea).toBeVisible({ timeout: 10000 });

    const box = await chartArea.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(300);
    expect(box!.width).toBeGreaterThan(200);
  });

  test('エラー時にエラーメッセージが表示される', async ({ page }) => {
    // このテストだけ describe 既定の成功モックを上書きし、決定的にエラー応答を返す
    // （Playwright はパターンが重複する route ハンドラを後着順に評価するため、
    // ここで登録したハンドラが beforeEach の成功モックより優先される）
    await page.route('**/api/chart/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'INTERNAL_ERROR',
          message: 'チャートデータの取得に失敗しました',
        }),
      });
    });

    await page.locator('#exchange-select').selectOption(EXCHANGE_ID);

    const tickerSelect = page.locator('#ticker-select');
    await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
    await tickerSelect.selectOption(TICKER_ID);

    await expect(page.getByText('チャート読み込みエラー')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('チャートデータの取得に失敗しました')).toBeVisible();
  });
});

test.describe('チャート自動更新 (E2E-008)', () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request, baseSeed());
  });

  test('自動更新を有効にすると一定間隔でチャートデータが再取得される', async ({ page }) => {
    let fetchCount = 0;
    await page.route('**/api/chart/**', async (route) => {
      fetchCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildChartResponse()),
      });
    });

    // 仮想クロックを使い、実時間 (AUTO_REFRESH_INTERVAL_MS = 10秒) を待たずに
    // 自動更新タイマーを決定的に発火させる
    await page.clock.install();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('#exchange-select').selectOption(EXCHANGE_ID);
    const tickerSelect = page.locator('#ticker-select');
    await expect(tickerSelect).toBeEnabled({ timeout: 5000 });
    await tickerSelect.selectOption(TICKER_ID);

    await expect(page.getByRole('img', { name: /の株価チャート/ })).toBeVisible({
      timeout: 10000,
    });
    // 初回選択時点のフェッチ回数を基準値として記録する（開発サーバーの
    // React StrictMode により初回 effect が二重発火し 1 ではなく 2 になることがあるため、
    // 固定値ではなく「自動更新の前後での差分」で決定的に検証する）
    const fetchCountBeforeAutoRefresh = fetchCount;
    expect(fetchCountBeforeAutoRefresh).toBeGreaterThanOrEqual(1);

    const autoRefreshButton = page.getByRole('button', { name: '自動更新' });
    await autoRefreshButton.click();
    await expect(autoRefreshButton).toHaveAttribute('aria-pressed', 'true');

    // 自動更新の間隔分だけ仮想クロックを進める
    await page.clock.fastForward(AUTO_REFRESH_INTERVAL_MS);

    await expect.poll(() => fetchCount).toBeGreaterThan(fetchCountBeforeAutoRefresh);
  });
});

test.describe('チャート表示のアクセシビリティ', () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test('時間枠セレクタがキーボード操作可能である', async ({ page }) => {
    await page.goto('/');

    // 時間枠セレクトボックスにフォーカスを移動
    const timeframeSelect = page.locator('#timeframe-select');
    await timeframeSelect.focus();

    // キーボード操作可能性 = focus が当たることを検証する。
    // native select の値変更操作はブラウザ依存（webkit-mobile では Playwright の selectOption が
    // ピッカー UI 経由扱いになり change event が発火しない）のため、本テストでは検証しない。
    // 値変更検証は top-page-layout.spec.ts:99 等の他のテストでカバーされている。
    await expect(timeframeSelect).toBeFocused();
  });

  test('表示本数セレクタがキーボード操作可能である', async ({ page }) => {
    await page.goto('/');

    // 表示本数セレクトボックスにフォーカスを移動
    const barCountSelect = page.locator('#barcount-select');
    await barCountSelect.focus();

    // 時間枠セレクタと同様、focus が当たることのみを検証する
    await expect(barCountSelect).toBeFocused();
  });
});
