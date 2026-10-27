import type { Page } from '@playwright/test';
import { test, expect, resetState } from './fixtures';

/**
 * webkit-mobile 対応: 実 Service Worker（/sw.js）を無効化する。
 *
 * 本アプリは libs/react の ServiceWorkerRegistration が全ページで /sw.js を登録するため、
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
 * E2E-004: 日次サマリー閲覧フロー
 *
 * このテストは以下を検証します:
 * - 市場の荒れ予報カードとサマリー一覧テーブルの表示（方向・荒れ・点灯・アラート数、並べ替え）
 * - 詳細ダイアログの表示（確度カード・内訳・折りたたみ・保有情報・チャート）
 * - 確度がない日の表示と、トップ画面のサマリーパネル
 * - サマリーデータが0件の環境・存在する環境それぞれでの一覧・詳細ダイアログ表示
 * - stock-admin ロールのみが操作できるサマリー更新機能
 * - モバイル幅・デスクトップ幅それぞれでのナビゲーション
 *
 * サマリー一覧・詳細表示系のテストの多くは `/api/summaries` を `page.route` で固定応答に
 * 差し替えることで、TradingView 連携等の外部要因を排除し決定的に検証している。
 * 一方、旧実装には `process.env.TEST_USER_ROLES` を直接読んで assert 内容を分岐させるテストや、
 * 実行時に取得した行数で `test.skip()` するテストが混在していた。これらは
 * `resetState`（インメモリリポジトリの決定的な空状態化）と `test.use({ role })`
 * （`./fixtures` のロール固定）に置き換え、1 テスト = 1 結末に統一する。
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

/**
 * `/api/chart/{tickerId}` の成功応答ボディ（`@nagiyu/stock-tracker-core` の ChartData 相当）。
 *
 * TradingView への実疎通は環境によって 504 になりうるため、チャート描画を検証するテストでは
 * この固定応答に差し替えて決定的に成功させる。
 */
function buildChartResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tickerId: 'TEST:AAA',
    symbol: 'AAA',
    timeframe: '60',
    data: [
      { time: 1710000000000, open: 100, high: 110, low: 95, close: 105, volume: 1000000 },
      { time: 1710003600000, open: 105, high: 112, low: 100, close: 108, volume: 1200000 },
    ],
    ...overrides,
  };
}
type ProbabilityFixture = { probability: number; baseline: number; lean: string };

/** `/api/summaries` の銘柄 1 件分の応答ボディ（確度の要約つき）。 */
function buildTickerSummary(
  symbol: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    tickerId: `TEST:${symbol}`,
    date: '2026-03-02',
    symbol,
    name: `${symbol}株式会社`,
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1234567,
    updatedAt: '2026-03-02T00:00:00.000Z',
    buyPatternCount: 0,
    sellPatternCount: 0,
    buyAlertCount: { enabled: 0, disabled: 0 },
    sellAlertCount: { enabled: 0, disabled: 0 },
    holding: null,
    forecast: null,
    ...overrides,
  };
}

function buildForecastSummary(
  dir: ProbabilityFixture | null,
  vol: ProbabilityFixture | null,
  lit = { total: 0, buy: 0, sell: 0 }
): Record<string, unknown> {
  return { dir, vol, lit };
}

const DEFAULT_MARKET_FORECASTS = [
  {
    market: 'JP',
    date: '2026-03-02',
    forecast: { probability: 0.64, baseline: 0.5, lean: 'HIGH', lowSample: true },
  },
  { market: 'US', date: null, forecast: null },
];

/** `/api/summaries` の応答ボディ。 */
function buildSummariesResponse(
  summaries: Record<string, unknown>[],
  marketForecasts: unknown[] = DEFAULT_MARKET_FORECASTS
): Record<string, unknown> {
  return {
    exchanges: [
      {
        exchangeId: 'test-exchange-id',
        exchangeName: 'テスト取引所',
        date: '2026-03-02',
        summaries,
      },
    ],
    marketForecasts,
  };
}

/** ティッカー 1 件のみを含む `/api/summaries` の応答ボディ。 */
function buildSingleTickerSummaryResponse(): Record<string, unknown> {
  return buildSummariesResponse([
    buildTickerSummary('AAA', { holding: { quantity: 10, averagePrice: 98.5 } }),
  ]);
}

/** `/api/forecasts/{tickerId}` の応答ボディ。 */
function buildForecastDetailResponse(): Record<string, unknown> {
  const neutralBand = { lower: 0.47, upper: 0.53 };
  return {
    tickerId: 'TEST:AAA',
    date: '2026-03-02',
    questions: {
      DIR: {
        probability: 0.56,
        baseline: 0.5,
        lean: 'UP',
        neutralBand,
        bandHistory: { lower: 0.55, upper: 0.6, count: 212, hitRate: 0.57 },
        axes: [
          {
            axisId: 'morning-star',
            name: '三川明けの明星',
            kind: 'FLAG',
            lit: true,
            performance: { count: 120, hitRate: 0.58, diffFromBaseline: 0.08 },
            contribution: 0.021,
            lowSample: false,
          },
          {
            axisId: 'range-5d',
            name: '直近 5 日の値幅',
            kind: 'NUMERIC',
            ratio: 1.42,
            performance: { count: 10, hitRate: 0.5, diffFromBaseline: 0 },
            contribution: -0.008,
            lowSample: true,
          },
          {
            axisId: 'evening-star',
            name: '三川宵の明星',
            kind: 'FLAG',
            lit: false,
            performance: { count: 90, hitRate: 0.45, diffFromBaseline: -0.05 },
            contribution: 0,
            lowSample: false,
          },
        ],
      },
      VOL: {
        probability: 0.64,
        baseline: 0.5,
        lean: 'HIGH',
        neutralBand,
        bandHistory: { lower: 0.6, upper: 0.65, count: 12, hitRate: 0.6 },
        axes: [
          {
            axisId: 'gap',
            name: 'ギャップ',
            kind: 'FLAG',
            lit: true,
            performance: { count: 40, hitRate: 0.7, diffFromBaseline: 0.2 },
            contribution: 0.05,
            lowSample: false,
          },
        ],
      },
    },
  };
}

/** `/api/summaries` を固定応答に差し替える。更新バッチ用の `/refresh` にはマッチしない。 */
async function mockSummaries(page: Page, body: Record<string, unknown>): Promise<void> {
  await page.route('**/api/summaries', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/** `/api/forecasts/**` を固定応答に差し替える。省略時は確度なし(404)。 */
async function mockForecastDetail(
  page: Page,
  response: { status: number; body?: Record<string, unknown> } = { status: 404 }
): Promise<void> {
  await page.route('**/api/forecasts/**', async (route) => {
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(
        response.body ?? { error: 'NOT_FOUND', message: '指定日の確度が見つかりません' }
      ),
    });
  });
}

/** `/api/chart/**` を成功応答に差し替える。 */
async function mockChart(page: Page): Promise<void> {
  await page.route('**/api/chart/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildChartResponse()),
    });
  });
}

test.describe('サマリー画面スモークテスト', () => {
  test.beforeEach(async ({ request }) => {
    // /api/summaries は各テスト内で page.route により固定応答へ差し替えるが、
    // インメモリストア（取引所・ティッカー等）は resetState で毎回空の状態に揃えておく。
    await resetState(request);
  });

  test('サマリー一覧に確度・点灯・アラート数の列を表示できる', async ({ page }) => {
    await mockSummaries(
      page,
      buildSummariesResponse([
        buildTickerSummary('AAA', {
          buyAlertCount: { enabled: 1, disabled: 2 },
          holding: { quantity: 10, averagePrice: 98.5 },
          forecast: buildForecastSummary(
            { probability: 0.56, baseline: 0.5, lean: 'UP' },
            { probability: 0.64, baseline: 0.5, lean: 'HIGH' },
            { total: 3, buy: 2, sell: 1 }
          ),
        }),
        buildTickerSummary('BBB', {
          sellAlertCount: { enabled: 3, disabled: 1 },
          forecast: buildForecastSummary(
            { probability: 0.42, baseline: 0.5, lean: 'DOWN' },
            { probability: 0.4, baseline: 0.5, lean: 'NEUTRAL' }
          ),
        }),
        buildTickerSummary('CCC', {
          forecast: buildForecastSummary(
            { probability: 0.5, baseline: 0.5, lean: 'NEUTRAL' },
            null
          ),
        }),
        buildTickerSummary('DDD'),
      ])
    );

    await page.goto('/summaries');

    for (const name of [
      'シンボル',
      '銘柄名',
      '保有',
      '方向',
      '荒れ',
      '点灯',
      '買いアラート数',
      '売りアラート数',
    ]) {
      await expect(page.getByRole('columnheader', { name })).toBeVisible();
    }
    for (const name of ['投資判断', '予測リターン', '確信度', '買いシグナル', '売りシグナル']) {
      await expect(page.getByRole('columnheader', { name })).toHaveCount(0);
    }
    const buyAlertHeader = page.getByRole('columnheader', { name: '買いアラート数' });
    await expect(buyAlertHeader).toHaveCSS('white-space', 'nowrap');
    await expect(page.locator('.MuiTableContainer-root').first()).toHaveCSS('overflow-x', 'auto');
    await expect(page.locator('tbody tr')).toHaveCount(4);

    await expect(page.getByTestId('dir-TEST:AAA')).toHaveText('強含み56%');
    await expect(page.getByTestId('vol-TEST:AAA')).toHaveText('荒れそう64%');
    await expect(page.getByTestId('lit-TEST:AAA')).toHaveText('3（買2売1）');
    await expect(page.getByTestId('buy-alert-TEST:AAA')).toHaveText('1 (2)');
    await expect(page.getByTestId('dir-TEST:BBB')).toHaveText('弱含み42%');
    await expect(page.getByTestId('vol-TEST:BBB')).toHaveText('平常40%');
    await expect(page.getByTestId('sell-alert-TEST:BBB')).toHaveText('3 (1)');
    await expect(page.getByTestId('dir-TEST:CCC')).toHaveText('中立50%');
    await expect(page.getByTestId('vol-TEST:CCC')).toHaveText('—');
    await expect(page.getByTestId('dir-TEST:DDD')).toHaveText('—');
    await expect(page.getByTestId('lit-TEST:DDD')).toHaveText('—');
  });

  test('市場の荒れ予報を 1 枚のカードに JP・US の行として表示できる', async ({ page }) => {
    await mockSummaries(page, buildSummariesResponse([buildTickerSummary('AAA')]));

    await page.goto('/summaries');

    await expect(page.getByTestId('market-forecast-card')).toHaveCount(1);
    const jp = page.getByTestId('market-forecast-JP');
    await expect(jp.getByTestId('market-forecast-label-JP')).toHaveText('荒れそう');
    await expect(jp.getByTestId('market-forecast-probability-JP')).toHaveText('荒れる確率 64%');
    await expect(jp.getByText('3/2 引け時点')).toBeVisible();
    await expect(page.getByTestId('market-forecast-usual')).toHaveText('ふだんの荒れる割合 50%');
    await expect(page.getByText('過去の日数が少ないため参考値')).toHaveCount(1);
    await expect(
      page.getByTestId('market-forecast-US').getByTestId('market-forecast-label-US')
    ).toHaveText('—');

    await page.getByRole('button', { name: '市場の荒れ予報の説明' }).hover();
    await expect(page.getByRole('tooltip')).toContainText('値幅がふだんより大きくなる確率');
  });

  test('方向・荒れの列見出しで確率順に並べ替えられる', async ({ page }) => {
    await mockSummaries(
      page,
      buildSummariesResponse([
        buildTickerSummary('AAA', {
          forecast: buildForecastSummary(
            { probability: 0.5, baseline: 0.5, lean: 'NEUTRAL' },
            { probability: 0.4, baseline: 0.5, lean: 'NEUTRAL' }
          ),
        }),
        buildTickerSummary('BBB', {
          forecast: buildForecastSummary(
            { probability: 0.62, baseline: 0.5, lean: 'UP' },
            { probability: 0.7, baseline: 0.5, lean: 'HIGH' }
          ),
        }),
        buildTickerSummary('CCC'),
        buildTickerSummary('DDD', {
          forecast: buildForecastSummary(
            { probability: 0.35, baseline: 0.5, lean: 'DOWN' },
            { probability: 0.5, baseline: 0.5, lean: 'NEUTRAL' }
          ),
        }),
      ])
    );

    await page.goto('/summaries');
    const symbols = () => page.locator('tbody tr td:first-child').allTextContents();
    await expect.poll(symbols).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);

    await page.getByTestId('sort-dir').click();
    await expect.poll(symbols).toEqual(['BBB', 'AAA', 'DDD', 'CCC']);
    await page.getByTestId('sort-dir').click();
    await expect.poll(symbols).toEqual(['DDD', 'AAA', 'BBB', 'CCC']);
    await page.getByTestId('sort-dir').click();
    await expect.poll(symbols).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);

    await page.getByTestId('sort-vol').click();
    await expect.poll(symbols).toEqual(['BBB', 'DDD', 'AAA', 'CCC']);
  });

  test('保有情報と買い/売りアラート設定ボタンを条件に応じて表示できる', async ({ page }) => {
    await mockSummaries(
      page,
      buildSummariesResponse([
        buildTickerSummary('AAA', { holding: { quantity: 123, averagePrice: 99.5 } }),
        buildTickerSummary('BBB', { volume: undefined }),
      ])
    );
    await mockForecastDetail(page);

    await page.goto('/summaries');
    await expect(page.getByRole('columnheader', { name: '保有' })).toBeVisible();

    const firstRow = page.locator('tbody tr').nth(0);
    const secondRow = page.locator('tbody tr').nth(1);
    await expect(firstRow.locator('td').nth(2)).toHaveText('✓');
    await expect(secondRow.locator('td').nth(2)).toHaveText('-');

    await firstRow.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('保有数')).toBeVisible();
    await expect(dialog.getByText('123')).toBeVisible();
    await expect(dialog.getByText('99.50')).toBeVisible();
    await expect(dialog.locator('tr', { hasText: '出来高' }).locator('td')).toHaveText('1,234,567');
    await expect(dialog.getByRole('button', { name: '買いアラート設定' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '売りアラート設定' })).toBeVisible();

    await dialog.getByRole('button', { name: '買いアラート設定' }).click();
    await expect(page.getByRole('heading', { name: 'アラート設定 (買いアラート)' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'アラート設定 (買いアラート)' })).toHaveCount(0);

    await dialog.getByRole('button', { name: '閉じる' }).click();
    await secondRow.click();
    await expect(dialog.locator('tr', { hasText: '出来高' }).locator('td')).toHaveText('-');
    await expect(dialog.getByRole('button', { name: '買いアラート設定' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '売りアラート設定' })).toHaveCount(0);
  });

  test('詳細ダイアログで確度・同じ確率帯の実績・内訳を表示できる', async ({ page }) => {
    await mockSummaries(page, buildSingleTickerSummaryResponse());
    await mockForecastDetail(page, { status: 200, body: buildForecastDetailResponse() });

    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('3/2 引け時点')).toBeVisible();

    const dirCard = dialog.getByTestId('forecast-card-DIR');
    await expect(dirCard.getByText('強含み')).toBeVisible();
    await expect(dirCard.getByText('上回る確率 56% (ふだん 50%)')).toBeVisible();
    await expect(dirCard.getByText('55〜60% の帯の実績: 的中 57%（212 件）')).toBeVisible();
    await expect(dirCard.getByText('件数が少なく参考値')).toHaveCount(0);

    const volCard = dialog.getByTestId('forecast-card-VOL');
    await expect(volCard.getByText('荒れそう')).toBeVisible();
    await expect(volCard.getByTestId('forecast-probability-VOL')).toContainText('荒れる確率 64%');
    await expect(volCard.getByText('件数が少なく参考値')).toBeVisible();

    // 方向の内訳(寄与の絶対値の大きい順)。モバイル幅では値・過去成績の列は行の展開で見せる
    const table = dialog.getByTestId('breakdown-DIR-table');
    await expect(table.getByText('三川明けの明星')).toBeVisible();
    await expect(table.getByText('+2.1pt')).toBeVisible();
    await expect(table.getByText(/−0\.8pt/)).toBeVisible();
    await expect(table.getByText('件数不足')).toBeVisible();

    // 点灯しなかった軸は既定で閉じた折りたたみ
    const fold = dialog.getByTestId('breakdown-DIR-inactive');
    const foldToggle = fold.getByRole('button', { name: /点灯しなかった軸/ });
    await expect(foldToggle).toHaveAttribute('aria-expanded', 'false');
    await foldToggle.click();
    await expect(foldToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(fold.getByText('三川宵の明星')).toBeVisible();

    await dialog.getByRole('tab', { name: '荒れの内訳' }).click();
    await expect(dialog.getByTestId('breakdown-VOL-table').getByText('ギャップ')).toBeVisible();
  });

  test('確度がない日は「—」と理由を表示し、チャートとアラート作成は使える', async ({ page }) => {
    await mockSummaries(page, buildSingleTickerSummaryResponse());
    await mockForecastDetail(page);
    await mockChart(page);

    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('forecast-unavailable-reason')).toHaveText(
      'この日の確度はありません'
    );
    await expect(dialog.getByTestId('forecast-label-DIR')).toHaveText('—');
    await expect(dialog.getByTestId('forecast-label-VOL')).toHaveText('—');
    await expect(dialog.getByLabel('AAA の株価チャート')).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByRole('button', { name: '買いアラート設定' })).toBeVisible();
  });

  test('詳細ダイアログとアラート設定ダイアログでチャートを表示できる', async ({ page }) => {
    await mockSummaries(page, buildSingleTickerSummaryResponse());
    await mockForecastDetail(page);
    // TradingView への実疎通は環境によって 504 になりうるため、`/api/chart/**` を固定応答に
    // 差し替えてチャート描画を決定的に成功させる（chart-display.spec.ts と同じ方針）。
    await mockChart(page);

    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const summaryDialog = page.getByRole('dialog');
    await expect(summaryDialog.getByText('株価チャート')).toBeVisible();
    await expect(summaryDialog.getByLabel('AAA の株価チャート')).toBeVisible({ timeout: 10000 });

    await summaryDialog.getByRole('button', { name: '買いアラート設定' }).click();
    const alertDialog = page.getByRole('dialog', { name: 'アラート設定 (買いアラート)' });
    await expect(alertDialog.getByText('株価チャート')).toBeVisible();
    await expect(alertDialog.getByLabel('時間枠')).toBeVisible();
    await expect(alertDialog.getByLabel('AAA の株価チャート')).toBeVisible({ timeout: 10000 });
  });

  test('チャートデータ取得に失敗した場合はチャート読み込みエラーが表示される', async ({ page }) => {
    await mockSummaries(page, buildSingleTickerSummaryResponse());
    await mockForecastDetail(page);

    // チャート取得のみ 500 に固定し、エラー表示という単一の結末を検証する。
    await page.route('**/api/chart/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'INTERNAL_SERVER_ERROR', message: 'チャート取得に失敗' }),
      });
    });

    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const summaryDialog = page.getByRole('dialog');
    await expect(summaryDialog.getByText('チャート読み込みエラー')).toBeVisible({ timeout: 10000 });
    await expect(summaryDialog.getByLabel('AAA の株価チャート')).toHaveCount(0);
  });

  test('詳細ダイアログに AI 由来の表示とパターン一覧が出ない', async ({ page }) => {
    await mockSummaries(page, buildSingleTickerSummaryResponse());
    await mockForecastDetail(page, { status: 200, body: buildForecastDetailResponse() });

    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('forecast-card-DIR')).toBeVisible();
    for (const text of [
      'AI 解析',
      'パターン分析',
      '投資判断',
      '予測リターン',
      '確信度',
      'サポートレベル',
      'レジスタンスレベル',
    ]) {
      await expect(dialog.getByText(text)).toHaveCount(0);
    }
  });

  test('詳細ダイアログがモバイル幅で画面内に収まる', async ({ page }) => {
    const detail = buildForecastDetailResponse();
    const dir = (detail.questions as Record<string, { axes: Record<string, unknown>[] }>).DIR;
    dir.axes[0].name = 'モバイル幅検証のための非常に長い軸名ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    await mockSummaries(page, buildSingleTickerSummaryResponse());
    await mockForecastDetail(page, { status: 200, body: detail });
    await mockChart(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('breakdown-DIR-table')).toBeVisible();

    const viewportWidth = 375;
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.width).toBeLessThanOrEqual(viewportWidth);

    const overflowInfo = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      return {
        rootOverflows: root.scrollWidth > root.clientWidth,
        bodyOverflows: body.scrollWidth > body.clientWidth,
      };
    });
    expect(overflowInfo.rootOverflows).toBeFalsy();
    expect(overflowInfo.bodyOverflows).toBeFalsy();
  });

  test('トップ画面のサマリーパネルに基準日・方向・荒れ・点灯を表示し、詳細ボタンでダイアログを開ける', async ({
    page,
  }) => {
    await page.route('**/api/exchanges', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [
            {
              exchangeId: 'test-exchange-id',
              name: 'テスト取引所',
              key: 'TEST',
              timezone: 'Asia/Tokyo',
              tradingHours: { start: '09:00', end: '15:00' },
            },
          ],
        }),
      });
    });
    await page.route('**/api/tickers?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tickers: [
            {
              tickerId: 'TEST:AAA',
              symbol: 'AAA',
              name: 'AAA株式会社',
              exchangeId: 'test-exchange-id',
            },
          ],
        }),
      });
    });
    await page.route('**/api/summaries/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          buildTickerSummary('AAA', {
            forecast: buildForecastSummary(
              { probability: 0.56, baseline: 0.5, lean: 'UP' },
              { probability: 0.4, baseline: 0.5, lean: 'NEUTRAL' },
              { total: 3, buy: 2, sell: 1 }
            ),
          })
        ),
      });
    });
    await page.route('**/api/holdings/tickers/**', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/api/alerts/tickers/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ alerts: [] }),
      });
    });
    await mockForecastDetail(page, { status: 200, body: buildForecastDetailResponse() });
    await mockChart(page);

    await page.goto('/?exchangeId=test-exchange-id&tickerId=TEST%3AAAA');

    await expect(page.getByTestId('summary-reference-date')).toHaveText('3/2 引け時点');
    await expect(page.getByTestId('summary-dir-label')).toHaveText('強含み');
    await expect(page.getByTestId('summary-dir-probability')).toHaveText(
      '上回る確率 56% (ふだん 50%)'
    );
    await expect(page.getByTestId('summary-vol-label')).toHaveText('平常');
    await expect(page.getByTestId('summary-lit')).toHaveText('点灯: 3（買2売1）');
    for (const text of ['投資判断', '予測リターン', '確信度', 'サポートレベル']) {
      await expect(page.getByText(text)).toHaveCount(0);
    }

    await page.getByRole('button', { name: '詳細' }).click();
    await expect(page.getByRole('dialog').getByTestId('forecast-card-DIR')).toBeVisible();
  });

  test('サマリーページの基本要素が表示される', async ({ page }) => {
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    await expect(page.getByLabel('取引所')).toBeVisible();
  });

  test('データ未投入環境ではサマリー行が0件でもページ表示できる', async ({ page }) => {
    // beforeEach の resetState により取引所・ティッカーは必ず0件のため、
    // サマリー行も決定的に0件になる（環境依存の実行時カウントに頼らない）。
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('行クリックでダイアログ表示できる', async ({ page }) => {
    // ResetSeedData はサマリーデータ自体を seed できないため、他の詳細ダイアログ系テストと
    // 同様に /api/summaries を page.route で固定応答に差し替えて1件のサマリー行を用意する。
    await mockSummaries(page, buildSingleTickerSummaryResponse());
    await mockForecastDetail(page);

    await page.goto('/summaries');
    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '閉じる' }).click();

    await expect(dialog).not.toBeVisible();
  });

  test.describe('ナビゲーション - モバイル幅', () => {
    // ハンバーガーメニューの表示は viewport 幅に基づく CSS メディアクエリ（MUI xs/md
    // ブレークポイント）で決まり、UA/デバイス種別には依存しない。そのため
    // `test.use({ viewport })` でモバイル幅を固定し、ハンバーガーメニュー経由の
    // 遷移という単一の結末を検証する（プロジェクトの実行環境に関わらず決定的）。
    test.use({ viewport: { width: 393, height: 851 } });

    test('ハンバーガーメニュー経由でサマリーページに遷移できる', async ({ page }) => {
      await page.goto('/');

      const menuButton = page.getByRole('button', { name: 'メニューを開く' });
      await expect(menuButton).toBeVisible();
      await menuButton.click();

      const summaryLink = page
        .getByRole('navigation', { name: 'ナビゲーションメニュー' })
        .getByRole('link', { name: 'サマリー' });
      await expect(summaryLink).toBeVisible();
      await summaryLink.click();

      await expect(page).toHaveURL('/summaries');
      await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    });
  });

  test.describe('ナビゲーション - デスクトップ幅', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('ヘッダーの横並びメニューから直接サマリーページに遷移できる', async ({ page }) => {
      await page.goto('/');

      const summaryLink = page.getByRole('banner').getByRole('link', { name: 'サマリー' });
      await expect(summaryLink).toBeVisible();
      await summaryLink.click();

      await expect(page).toHaveURL('/summaries');
      await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    });
  });

  test.describe('サマリー更新ボタン - stock-admin ロール', () => {
    test.use({ role: ['stock-admin'] });

    test('サマリー更新ボタンが表示される', async ({ page }) => {
      await page.goto('/summaries');
      await expect(page.getByRole('button', { name: 'サマリー更新' })).toBeVisible();
    });

    test('更新ボタンでバッチをキックした後に一覧が再取得される', async ({ page }) => {
      let summariesRequests = 0;
      await page.route('**/api/summaries', async (route) => {
        summariesRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildSingleTickerSummaryResponse()),
        });
      });

      await page.route('**/api/summaries/refresh', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'ok' }),
        });
      });

      await page.goto('/summaries');
      await expect(page.locator('tbody tr')).toHaveCount(1);
      await page.getByRole('button', { name: 'サマリー更新' }).click();

      await expect(page.getByText('サマリーバッチを実行しました')).toBeVisible();
      expect(summariesRequests).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('サマリー更新ボタン - stock-viewer ロール', () => {
    test.use({ role: ['stock-viewer'] });

    test('サマリー更新ボタンが表示されない', async ({ page }) => {
      // 「ボタンが無い」assert はクライアントのセッション取得前でも通ってしまうため、
      // `useSession()` が叩く `/api/auth/session` の応答が stock-viewer であることを
      // 確認してから検証する。応答は goto より前に待ち受けておかないと取りこぼす。
      const sessionResponsePromise = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/auth/session'
      );

      await page.goto('/summaries');
      await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();

      const sessionResponse = await sessionResponsePromise;
      const sessionBody = await sessionResponse.json();
      expect(sessionBody.user.roles).toEqual(['stock-viewer']);

      // ヘッダのアカウントメニューは session.user があるときだけ描画される（未取得時は
      // ログアウトボタンが出る）。ボタン表示の判定と同じ SessionProvider の state から
      // 描画され、デスクトップ・モバイルとも常設のため、これが見えれば
      // セッションが React に反映済みと言える。
      await expect(page.getByRole('button', { name: 'アカウントメニュー' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'サマリー更新' })).toHaveCount(0);
    });
  });
});
