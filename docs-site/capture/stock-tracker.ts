import type { Locator, Page } from '@playwright/test';
import type { Scenario, ScenarioContext, ServiceCapture } from './types';
import {
  AXIS_PERFORMANCE_RESPONSE,
  EMPTY_SEED,
  EMPTY_SUMMARIES_RESPONSE,
  EXCHANGES,
  FORECAST_DETAIL_RESPONSE,
  FULL_SEED,
  SUMMARIES_RESPONSE,
  TICKER_SUMMARIES,
  buildChartResponse,
} from './stock-tracker-data';

/**
 * stock-tracker の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 */

/** どの権限も持たないロール (`stocks:*` を含まない) */
const NO_PERMISSION_ROLES = ['user-manager'];
/** チャートの描画アニメーションが終わるまでの待ち */
const CHART_SETTLE_MS = 2500;
const VIEWER_ROLES = ['stock-viewer'];
const USER_ROLES = ['stock-user'];

async function mockJson(page: Page, pattern: string, body: unknown, status = 200): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

/** チャート API を、時間枠と本数に合わせた固定の値動きで差し替える */
async function mockChart(page: Page): Promise<void> {
  await page.route('**/api/chart/**', (route) => {
    const url = new URL(route.request().url());
    const tickerId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    const count = Number(url.searchParams.get('count') ?? 100);
    const timeframe = url.searchParams.get('timeframe') ?? '60';
    const basePrice = tickerId === 'TSE:7203' ? 2700 : tickerId === 'NASDAQ:MSFT' ? 400 : 195;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildChartResponse(tickerId, timeframe, count, basePrice)),
    });
  });
}

async function mockSummaryApis(page: Page): Promise<void> {
  await mockJson(page, '**/api/summaries', SUMMARIES_RESPONSE);
  await mockJson(page, '**/api/forecasts/**', FORECAST_DETAIL_RESPONSE);
  await mockChart(page);
}

/** 表を含む画面が描画されるまで待つ。サーバーの初回コンパイルで遅くなるため、待つ対象を明示する */
async function ready(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
  await settleNetwork(page);
}

/** 開発サーバーの接続が通信の静けさを妨げることがあるので、待ちすぎないようにする */
async function settleNetwork(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

/**
 * アラート API の応答を、ティッカー ID とモードの順に並べ替える。
 * アラート ID が毎回ランダムで、API の並びが実行ごとに変わり、画像が毎回違ってしまうため
 */
async function stableAlertOrder(page: Page): Promise<void> {
  await page.route('**/api/alerts**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const body = await response.json().catch(() => null);
    if (!body || !Array.isArray(body.alerts)) return route.fulfill({ response });
    body.alerts.sort(
      (a: { tickerId: string; mode: string }, b: { tickerId: string; mode: string }) =>
        `${a.tickerId}/${a.mode}`.localeCompare(`${b.tickerId}/${b.mode}`)
    );
    return route.fulfill({ response, json: body });
  });
}

/** 画面のエラー表示。Next.js の画面遷移の通知も `alert` なので、中身のあるものに絞る */
const errorAlert = (page: Page): Locator => page.getByRole('alert').filter({ hasText: /\S/ });

const dialog = (page: Page): Locator => page.getByRole('dialog');

/** ダイアログを開いた状態を撮る。ダイアログの周りだけを切り出す */
async function shotDialog(ctx: ScenarioContext, state: string, settleMs?: number): Promise<void> {
  await dialog(ctx.page).waitFor();
  await ctx.shot(state, { around: dialog(ctx.page), settleMs });
}

/** 撮影の都合で用意した画面から開いたダイアログを閉じる */
async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await dialog(page).waitFor({ state: 'detached' });
}

const home: Scenario = {
  screen: 'home',
  async run(ctx) {
    const selected = '/?exchangeId=ex-nasdaq&tickerId=NASDAQ:AAPL';
    const card = (page: Page, title: string): Locator =>
      page.locator('.MuiCard-root', {
        has: page.getByRole('heading', { name: title, exact: true }),
      });

    // 銘柄を選んでいない状態
    await ctx.resetData(FULL_SEED);
    let page = await ctx.freshPage();
    await stableAlertOrder(page);
    await mockChart(page);
    await page.goto('/');
    await ready(page, '取引所とティッカーを選択してください');
    await ctx.shot('unselected');

    // 銘柄を選んだ状態 (チャート・サマリー・保有株式・アラート)
    page = await ctx.freshPage();
    await stableAlertOrder(page);
    await mockChart(page);
    await mockJson(page, '**/api/summaries/**', TICKER_SUMMARIES['NASDAQ:AAPL']);
    await page.goto(selected);
    await page.getByRole('img', { name: /の株価チャート/ }).waitFor();
    await page.getByRole('heading', { name: 'サマリー', exact: true }).waitFor();
    await settleNetwork(page);
    await ctx.shot('selected', { settleMs: CHART_SETTLE_MS });

    // 保有株式の登録ダイアログ (保有がない銘柄で開く)
    await ctx.resetData(EMPTY_SEED);
    page = await ctx.freshPage();
    await stableAlertOrder(page);
    await mockChart(page);
    await page.goto(selected);
    await ready(page, '保有なし');
    await ctx.shot('no-holding-no-alert', { settleMs: CHART_SETTLE_MS });
    await card(page, '保有株式').getByRole('button', { name: '追加' }).click();
    await shotDialog(ctx, 'holding-dialog');

    // アラート設定ダイアログ
    await closeDialog(page);
    await page.getByRole('button', { name: '買い追加' }).click();
    await dialog(page)
      .getByRole('img', { name: /の株価チャート/ })
      .waitFor();
    await shotDialog(ctx, 'alert-dialog', CHART_SETTLE_MS);

    // サマリーの詳細ダイアログ
    await ctx.resetData(FULL_SEED);
    page = await ctx.freshPage();
    await stableAlertOrder(page);
    await mockChart(page);
    await mockJson(page, '**/api/summaries/**', TICKER_SUMMARIES['NASDAQ:AAPL']);
    await mockJson(page, '**/api/forecasts/**', FORECAST_DETAIL_RESPONSE);
    await page.goto(selected);
    await page.getByRole('heading', { name: 'サマリー', exact: true }).waitFor();
    await settleNetwork(page);
    await card(page, 'サマリー').getByRole('button', { name: '詳細' }).click();
    await page.getByTestId('forecast-card-DIR').waitFor();
    await ctx.shot('summary-dialog', { around: dialog(page), settleMs: CHART_SETTLE_MS });

    // 保有株式の削除確認 (売りアラートも消えることを確かめる)
    await closeDialog(page);
    await card(page, '保有株式').getByRole('button', { name: '削除' }).click();
    await shotDialog(ctx, 'holding-delete-dialog');

    // チャート取得に失敗した状態
    page = await ctx.freshPage();
    await stableAlertOrder(page);
    await mockJson(
      page,
      '**/api/chart/**',
      { error: 'INTERNAL_ERROR', message: 'チャートデータの取得に失敗しました' },
      500
    );
    await mockJson(page, '**/api/summaries/**', TICKER_SUMMARIES['NASDAQ:AAPL']);
    await page.goto(selected);
    await page.getByText('チャート読み込みエラー').waitFor();
    await page.getByRole('heading', { name: 'サマリー', exact: true }).waitFor();
    await settleNetwork(page);
    await ctx.shot('chart-error');

    // 閲覧だけできるロール: 追加・編集・削除のボタンが出ない
    page = await ctx.freshPage({ roles: VIEWER_ROLES });
    await stableAlertOrder(page);
    await mockChart(page);
    await mockJson(page, '**/api/summaries/**', TICKER_SUMMARIES['NASDAQ:AAPL']);
    await page.goto(selected);
    await page.getByRole('img', { name: /の株価チャート/ }).waitFor();
    await page.getByRole('heading', { name: 'サマリー', exact: true }).waitFor();
    await settleNetwork(page);
    await ctx.shot('viewer', { settleMs: CHART_SETTLE_MS });
  },
};

const tickers: Scenario = {
  screen: 'tickers',
  async run(ctx) {
    await ctx.resetData(FULL_SEED);
    let page = await ctx.freshPage();
    await page.goto('/tickers');
    await ready(page, 'Apple Inc.');
    await ctx.shot('default');

    await page.getByLabel('取引所でフィルタ').selectOption({ label: '東京証券取引所' });
    await page.getByText('Apple Inc.').waitFor({ state: 'detached' });
    await ctx.shot('filtered');

    // 取引所だけがあり、ティッカーがない状態
    await ctx.resetData(EMPTY_SEED_NO_TICKERS);
    page = await ctx.freshPage();
    await page.goto('/tickers');
    await ready(page, 'ティッカーが登録されていません');
    await ctx.shot('empty');

    // 登録ダイアログ
    await ctx.resetData(FULL_SEED);
    page = await ctx.freshPage();
    await page.goto('/tickers');
    await ready(page, 'Apple Inc.');
    await page.getByRole('button', { name: '新規作成' }).click();
    await dialog(page).getByLabel('シンボル').fill('NVDA');
    await dialog(page).getByLabel('銘柄名').fill('NVIDIA Corporation');
    await dialog(page).getByLabel('取引所').selectOption({ label: 'NASDAQ' });
    await shotDialog(ctx, 'create-dialog');

    // 登録済みのティッカーを作ろうとして失敗した状態 (API の実際のエラーを出す)
    await dialog(page).getByLabel('シンボル').fill('AAPL');
    await dialog(page).getByLabel('銘柄名').fill('Apple Inc.');
    await dialog(page).getByRole('button', { name: '作成' }).click();
    await errorAlert(page).waitFor();
    await ctx.shot('create-error', { viewportOnly: true });

    // 編集ダイアログ
    await closeDialog(page);
    await page.reload();
    await ready(page, 'Apple Inc.');
    await page.getByRole('button', { name: '編集 MSFT' }).click();
    await shotDialog(ctx, 'edit-dialog');

    // 削除の確認
    await closeDialog(page);
    await page.getByRole('button', { name: '削除 MSFT' }).click();
    await shotDialog(ctx, 'delete-dialog');

    // 一覧の取得に失敗した状態
    page = await ctx.freshPage();
    await mockJson(
      page,
      '**/api/tickers',
      { error: 'INTERNAL_SERVER_ERROR', message: 'ティッカー一覧の取得に失敗しました' },
      500
    );
    await page.goto('/tickers');
    await errorAlert(page).waitFor();
    await ctx.shot('fetch-error');

    // 権限がない状態
    page = await ctx.freshPage({ roles: VIEWER_ROLES });
    await page.goto('/tickers');
    await ready(page, '権限エラー');
    await ctx.shot('no-permission', { viewportOnly: true });
  },
};

const EMPTY_SEED_NO_TICKERS = { exchanges: EXCHANGES };

const exchanges: Scenario = {
  screen: 'exchanges',
  async run(ctx) {
    await ctx.resetData(FULL_SEED);
    let page = await ctx.freshPage();
    await page.goto('/exchanges');
    await ready(page, '東京証券取引所');
    await ctx.shot('default');

    await ctx.resetData({});
    page = await ctx.freshPage();
    await page.goto('/exchanges');
    await ready(page, '取引所が登録されていません');
    await ctx.shot('empty');

    // 登録ダイアログ
    await ctx.resetData(FULL_SEED);
    page = await ctx.freshPage();
    await page.goto('/exchanges');
    await ready(page, '東京証券取引所');
    await page.getByRole('button', { name: '新規登録' }).click();
    await dialog(page).waitFor();
    await dialog(page).getByPlaceholder('NASDAQ', { exact: true }).fill('NYSE');
    await dialog(page).getByPlaceholder('NASDAQ Stock Market').fill('New York Stock Exchange');
    await dialog(page).getByPlaceholder('NSDQ').fill('NYSE');
    await dialog(page).locator('#exchange-timezone').selectOption('America/New_York');
    await dialog(page).locator('#exchange-market-create').selectOption('US');
    await shotDialog(ctx, 'create-dialog');

    // 必須のタイムゾーンを未選択にして保存し、API が入力エラーを返した状態
    await dialog(page).locator('#exchange-timezone').selectOption('');
    await dialog(page).getByRole('button', { name: '保存' }).click();
    await page.getByText('タイムゾーンは必須です').waitFor();
    await ctx.shot('create-error', { viewportOnly: true });

    // 編集ダイアログ
    await closeDialog(page);
    await page.reload();
    await ready(page, '東京証券取引所');
    await page
      .getByRole('row', { name: /ex-tse/ })
      .getByRole('button', { name: '編集' })
      .click();
    await shotDialog(ctx, 'edit-dialog');

    // 削除の確認
    await closeDialog(page);
    await page
      .getByRole('row', { name: /ex-tse/ })
      .getByRole('button', { name: '削除' })
      .click();
    await shotDialog(ctx, 'delete-dialog');

    // 権限がない状態
    page = await ctx.freshPage({ roles: VIEWER_ROLES });
    await page.goto('/exchanges');
    await ready(page, '権限エラー');
    await ctx.shot('no-permission', { viewportOnly: true });
  },
};

const holdings: Scenario = {
  screen: 'holdings',
  async run(ctx) {
    await ctx.resetData(FULL_SEED);
    let page = await ctx.freshPage();
    await page.goto('/holdings');
    await ready(page, 'トヨタ自動車');
    await ctx.shot('default');

    await ctx.resetData(EMPTY_SEED);
    page = await ctx.freshPage();
    await page.goto('/holdings');
    await ready(page, '保有株式がありません');
    await ctx.shot('empty');

    // 登録ダイアログ
    await ctx.resetData(FULL_SEED);
    page = await ctx.freshPage();
    await page.goto('/holdings');
    await ready(page, 'トヨタ自動車');
    await page.getByRole('button', { name: '新規登録' }).click();
    await dialog(page).getByLabel('取引所').selectOption({ label: 'NASDAQ' });
    await dialog(page).getByLabel('ティッカー').selectOption('NASDAQ:MSFT');
    await shotDialog(ctx, 'create-dialog');

    // 範囲外の値で保存しようとした状態
    await dialog(page).getByLabel('保有数').fill('0');
    await dialog(page).getByLabel('平均取得価格').fill('2000000');
    await dialog(page).getByRole('button', { name: '保存' }).click();
    await dialog(page).getByText('保有数は0.0001以上').waitFor();
    await shotDialog(ctx, 'create-error');

    // 編集ダイアログ
    await closeDialog(page);
    await page.getByRole('row', { name: /AAPL/ }).getByRole('button', { name: '編集' }).click();
    await shotDialog(ctx, 'edit-dialog');

    // 削除の確認 (売りアラートも消えることを示す)
    await closeDialog(page);
    await page.getByRole('row', { name: /AAPL/ }).getByRole('button', { name: '削除' }).click();
    await dialog(page)
      .getByText('Sell')
      .first()
      .waitFor()
      .catch(() => undefined);
    await page.waitForLoadState('networkidle');
    await shotDialog(ctx, 'delete-dialog');

    // 売りアラートの設定
    await closeDialog(page);
    await mockChart(page);
    await page
      .getByRole('row', { name: /7203/ })
      .getByRole('button', { name: /売りアラート|アラート設定済/ })
      .click();
    await shotDialog(ctx, 'alert-dialog', CHART_SETTLE_MS);

    // 一覧の取得に失敗した状態
    page = await ctx.freshPage();
    await mockJson(
      page,
      '**/api/holdings**',
      { error: 'INTERNAL_SERVER_ERROR', message: '保有株式の取得に失敗しました' },
      500
    );
    await page.goto('/holdings');
    await errorAlert(page).waitFor();
    await ctx.shot('fetch-error', { viewportOnly: true });

    // 閲覧だけできるロール: 登録・売りアラート・編集・削除が出ない
    await ctx.resetData(FULL_SEED);
    page = await ctx.freshPage({ roles: VIEWER_ROLES });
    await page.goto('/holdings');
    await ready(page, 'トヨタ自動車');
    await ctx.shot('viewer');
  },
};

const alerts: Scenario = {
  screen: 'alerts',
  async run(ctx) {
    await ctx.resetData(FULL_SEED);
    let page = await ctx.freshPage();
    await stableAlertOrder(page);
    await page.goto('/alerts');
    await ready(page, '範囲内');
    await ctx.shot('default');

    // 取引所とモードで絞り込んだ状態
    await page.getByLabel('取引所フィルタ').selectOption({ label: 'NASDAQ' });
    await page.getByLabel('モードフィルタ').selectOption('Sell');
    await ctx.shot('filtered');

    // 絞り込みで 0 件になった状態
    await page.getByLabel('取引所フィルタ').selectOption({ label: '東京証券取引所' });
    await page.getByLabel('モードフィルタ').selectOption('Buy');
    await page.getByText('フィルタ条件に一致するアラートがありません').waitFor();
    await ctx.shot('filtered-empty');

    await ctx.resetData(EMPTY_SEED);
    page = await ctx.freshPage();
    await stableAlertOrder(page);
    await page.goto('/alerts');
    await ready(page, 'アラートがありません');
    await ctx.shot('empty');

    // 編集ダイアログ
    await ctx.resetData(FULL_SEED);
    page = await ctx.freshPage();
    await stableAlertOrder(page);
    await mockChart(page);
    await page.goto('/alerts');
    await ready(page, '範囲内');
    await page
      .getByRole('row', { name: /範囲内/ })
      .getByRole('button', { name: '編集' })
      .click();
    await dialog(page)
      .getByRole('img', { name: /の株価チャート/ })
      .waitFor();
    await shotDialog(ctx, 'edit-dialog', CHART_SETTLE_MS);

    // 削除の確認
    await closeDialog(page);
    await page
      .getByRole('row', { name: /範囲内/ })
      .getByRole('button', { name: '削除' })
      .click();
    await shotDialog(ctx, 'delete-dialog');

    // 一覧の取得に失敗した状態
    page = await ctx.freshPage();
    await stableAlertOrder(page);
    await mockJson(
      page,
      '**/api/alerts**',
      { error: 'INTERNAL_SERVER_ERROR', message: 'アラート一覧の取得に失敗しました' },
      500
    );
    await page.goto('/alerts');
    await errorAlert(page).waitFor();
    await ctx.shot('fetch-error', { viewportOnly: true });

    // 閲覧だけできるロール: 編集・削除が出ない
    page = await ctx.freshPage({ roles: VIEWER_ROLES });
    await stableAlertOrder(page);
    await page.goto('/alerts');
    await ready(page, '範囲内');
    await ctx.shot('viewer');
  },
};

const summaries: Scenario = {
  screen: 'summaries',
  async run(ctx) {
    await ctx.resetData(FULL_SEED);
    let page = await ctx.freshPage();
    await mockSummaryApis(page);
    await page.goto('/summaries');
    await ready(page, 'トヨタ自動車');
    await ctx.shot('default');

    // 方向の列で並べ替えた状態
    await page.getByTestId('sort-dir').first().click();
    await ctx.shot('sorted');

    // 銘柄の詳細ダイアログ (確度の内訳とチャート)
    await page.getByRole('row', { name: /AAPL/ }).click();
    await page.getByTestId('forecast-card-DIR').waitFor();
    await page.getByRole('img', { name: /の株価チャート/ }).waitFor();
    await ctx.shot('detail-dialog', {
      around: dialog(page),
      settleMs: CHART_SETTLE_MS,
    });

    // 荒れの内訳に切り替えた状態
    await page.getByRole('tab', { name: '荒れの内訳' }).click();
    await ctx.shot('detail-dialog-vol', {
      around: dialog(page),
      settleMs: CHART_SETTLE_MS,
    });

    // 確度がない銘柄の詳細
    await closeDialog(page);
    await mockJson(
      page,
      '**/api/forecasts/**',
      { error: 'NOT_FOUND', message: '指定日の確度が見つかりません' },
      404
    );
    await page.getByRole('row', { name: /7203/ }).click();
    await page.getByTestId('forecast-unavailable-reason').waitFor();
    await ctx.shot('detail-dialog-no-forecast', {
      around: dialog(page),
      settleMs: CHART_SETTLE_MS,
    });

    // 銘柄がない取引所
    await ctx.resetData(FULL_SEED);
    page = await ctx.freshPage();
    await mockJson(page, '**/api/summaries', EMPTY_SUMMARIES_RESPONSE);
    await page.goto('/summaries');
    await ready(page, 'データがありません');
    await ctx.shot('empty');

    // 取得に失敗した状態
    page = await ctx.freshPage();
    await mockJson(
      page,
      '**/api/summaries',
      { error: 'INTERNAL_SERVER_ERROR', message: 'サマリーの取得に失敗しました' },
      500
    );
    await page.goto('/summaries');
    await errorAlert(page).waitFor();
    await ctx.shot('fetch-error', { viewportOnly: true });

    // 書き込みの権限だけを持つロール: 「サマリー更新」が出ない
    page = await ctx.freshPage({ roles: USER_ROLES });
    await mockSummaryApis(page);
    await page.goto('/summaries');
    await ready(page, 'トヨタ自動車');
    await ctx.shot('user-role', { viewportOnly: true });
  },
};

const axisPerformance: Scenario = {
  screen: 'axis-performance',
  async run(ctx) {
    await ctx.resetData({});
    let page = await ctx.freshPage({ roles: VIEWER_ROLES });
    // 問い・市場・期間の切り替えに合わせて、応答の見出しの値を変える
    await page.route('**/api/axis-performance**', (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...AXIS_PERFORMANCE_RESPONSE,
          question: url.searchParams.get('question'),
          period: url.searchParams.get('period'),
          market: url.searchParams.get('market'),
        }),
      });
    });
    await page.goto('/axis-performance');
    await page.getByTestId('axis-row').first().waitFor();
    await ctx.shot('default', { settleMs: CHART_SETTLE_MS });

    // 「ふだん」の説明
    await page.getByTestId('baseline-help').hover();
    await page.getByRole('tooltip').waitFor();
    await ctx.shot('baseline-help', { viewportOnly: true, settleMs: CHART_SETTLE_MS });

    // 市場の荒れ・JP・30 日に切り替えた状態
    await page.getByRole('tab', { name: '市場の荒れ' }).click();
    await page.getByRole('button', { name: '30 日' }).click();
    await page.waitForLoadState('networkidle');
    await ctx.shot('market-30d', { settleMs: CHART_SETTLE_MS });

    // 採点済みの予測がない状態
    page = await ctx.freshPage({ roles: VIEWER_ROLES });
    await mockJson(page, '**/api/axis-performance**', {
      ...AXIS_PERFORMANCE_RESPONSE,
      from: null,
      to: null,
      evaluatedCount: 0,
      hitRate: 0,
      neutralBand: null,
      calibration: [],
      axes: [],
    });
    await page.goto('/axis-performance');
    await page.getByTestId('axis-performance-empty').waitFor();
    await ctx.shot('empty', { viewportOnly: true });

    // 取得に失敗した状態
    page = await ctx.freshPage({ roles: VIEWER_ROLES });
    await mockJson(
      page,
      '**/api/axis-performance**',
      { error: 'INTERNAL_SERVER_ERROR', message: 'サーバーエラー' },
      500
    );
    await page.goto('/axis-performance');
    await errorAlert(page).waitFor();
    await ctx.shot('fetch-error', { viewportOnly: true });

    // 権限がない状態
    page = await ctx.freshPage({ roles: NO_PERMISSION_ROLES });
    await page.goto('/axis-performance');
    await ready(page, '権限エラー');
    await ctx.shot('no-permission', { viewportOnly: true });
  },
};

export const stockTracker: ServiceCapture = {
  service: 'stock-tracker',
  devices: ['mobile', 'desktop'],
  server: {
    cwd: 'services/stock-tracker/web',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3100,
    healthPath: '/api/health',
    envFile: 'services/stock-tracker/web/.env.test',
    requiredBuilds: ['libs/ui/dist', 'libs/nextjs/dist', 'services/stock-tracker/core/dist'],
  },
  fixedTime: '2026-02-28T01:30:00Z',
  scenarios: [home, tickers, exchanges, holdings, alerts, summaries, axisPerformance],
};
