import type { Page } from '@playwright/test';
import { test, expect, resetState } from './fixtures';

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
 * E2E-004: 日次サマリー閲覧フロー
 *
 * このテストは以下を検証します:
 * - サマリー一覧テーブルの表示（投資判断・シグナル数・アラート数）
 * - 詳細ダイアログの表示（保有情報・パターン分析・AI解析・チャート）
 * - サポート/レジスタンスチップからのアラート設定
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

/** ティッカー 1 件のみを含む `/api/summaries` の応答ボディ。 */
function buildSingleTickerSummaryResponse(): Record<string, unknown> {
  return {
    exchanges: [
      {
        exchangeId: 'test-exchange-id',
        exchangeName: 'テスト取引所',
        date: '2026-03-02',
        summaries: [
          {
            tickerId: 'TEST:AAA',
            symbol: 'AAA',
            name: 'AAA株式会社',
            open: 100,
            high: 110,
            low: 95,
            close: 105,
            updatedAt: '2026-03-02T00:00:00.000Z',
            buyPatternCount: 0,
            sellPatternCount: 0,
            patternDetails: [],
            holding: {
              quantity: 10,
              averagePrice: 98.5,
            },
          },
        ],
      },
    ],
  };
}

/**
 * クライアントセッション（`/api/auth/session`）のロールを固定する。
 *
 * ## なぜ `role` フィクスチャでは足りないのか
 *
 * `./fixtures` の `role` オプションは全リクエストに `x-test-user-roles` ヘッダを付与し、
 * `@nagiyu/nextjs` の `createSessionGetter` がそれを読んでロールを差し替える。
 * したがって **API ルートと Server Component には効く**（例: quick-actions.spec.ts は
 * QuickActions が Server Component から props で権限を受け取るため正しく機能する）。
 *
 * しかし `app/summaries/page.tsx` は Client Component で `useSession()` を使い、
 * NextAuth の `/api/auth/session`（`app/api/auth/[...nextauth]/route.ts`）から
 * セッションを取得する。この経路は `createSessionGetter` を通らないため、
 * ヘッダを付けても `.env.test` の `TEST_USER_ROLES`（= stock-admin）が返る。
 * 実測でも `test.use({ role: ['stock-viewer'] })` 下で roles が `['stock-admin']` に
 * なることを確認した。
 *
 * さらに、この画面の「ボタンが無いこと」の assert はセッション取得前だと無条件に通るため、
 * 放置すると CI のタイミング次第で結果が変わる（実際に chromium-desktop で失敗した）。
 *
 * そこで `/api/auth/session` を固定応答へ差し替え、指定ロールのセッションが確実に
 * 解決された状態を作る。権限判定ロジック（`hasPermission`）自体はアプリのコードが
 * そのまま評価するため、「このロールならボタンが出る／出ない」の検証意図は保たれる。
 */
async function stubClientSessionRoles(page: Page, roles: string[]): Promise<void> {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          userId: 'e2e-test-user',
          email: 'test-admin@example.com',
          name: 'E2E Test User',
          roles,
        },
        expires: '2099-12-31T23:59:59.000Z',
      }),
    });
  });
}

const LONG_TEXTS_FOR_MOBILE_DIALOG_TEST = {
  priceMovementAnalysis:
    'モバイル幅検証のための非常に長いテキストABCDEFGHIJKLMNABCDEFGHIJKLMNABCDEFGHIJKLMN',
  patternAnalysis: 'モバイル幅検証のための非常に長いテキストOPQRSTUVWXYZOPQRSTUVWXYZOPQRSTUVWXYZ',
  relatedMarketTrend:
    'モバイル幅検証のための非常に長いテキスト1234567890123456789012345678901234567890',
  investmentReason:
    'モバイル幅検証のための非常に長いテキストabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
} as const;

test.describe('サマリー画面スモークテスト', () => {
  test.beforeEach(async ({ request }) => {
    // /api/summaries は各テスト内で page.route により固定応答へ差し替えるが、
    // インメモリストア（取引所・ティッカー等）は resetState で毎回空の状態に揃えておく。
    await resetState(request);
  });

  test('サマリー一覧テーブルに投資判断・シグナル数・アラート数を表示できる', async ({ page }) => {
    await page.route('**/api/summaries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [
            {
              exchangeId: 'test-exchange-id',
              exchangeName: 'テスト取引所',
              date: '2026-03-02',
              summaries: [
                {
                  tickerId: 'TEST:AAA',
                  symbol: 'AAA',
                  name: 'AAA株式会社',
                  open: 100,
                  high: 110,
                  low: 95,
                  close: 105,
                  volume: 1234567,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 1,
                  sellPatternCount: 0,
                  buyAlertCount: {
                    enabled: 1,
                    disabled: 2,
                  },
                  sellAlertCount: {
                    enabled: 0,
                    disabled: 0,
                  },
                  patternDetails: [],
                  aiAnalysisResult: {
                    investmentJudgment: {
                      signal: 'BULLISH',
                    },
                  },
                  holding: {
                    quantity: 10,
                    averagePrice: 98.5,
                  },
                },
                {
                  tickerId: 'TEST:BBB',
                  symbol: 'BBB',
                  name: 'BBB株式会社',
                  open: 200,
                  high: 210,
                  low: 190,
                  close: 205,
                  volume: undefined,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 0,
                  sellPatternCount: 2,
                  buyAlertCount: {
                    enabled: 0,
                    disabled: 0,
                  },
                  sellAlertCount: {
                    enabled: 3,
                    disabled: 1,
                  },
                  patternDetails: [],
                  holding: null,
                },
              ],
            },
          ],
        }),
      });
    });

    await page.goto('/summaries');

    await expect(page.getByRole('columnheader', { name: '保有可否' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '投資判断' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '買いシグナル' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '売りシグナル' })).toBeVisible();
    const buyAlertHeader = page.getByRole('columnheader', { name: '買いアラート数' });
    const sellAlertHeader = page.getByRole('columnheader', { name: '売りアラート数' });
    await expect(buyAlertHeader).toBeVisible();
    await expect(sellAlertHeader).toBeVisible();
    await expect(buyAlertHeader).toHaveCSS('white-space', 'nowrap');
    await expect(sellAlertHeader).toHaveCSS('white-space', 'nowrap');
    await expect(page.locator('.MuiTableContainer-root').first()).toHaveCSS('overflow-x', 'auto');

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);

    await expect(page.getByTestId('buy-signal-TEST:AAA')).toHaveText('1');
    await expect(page.getByTestId('sell-signal-TEST:AAA')).toHaveText('0');
    await expect(page.getByTestId('investment-judgment-TEST:AAA')).toHaveText('強気');
    await expect(page.getByTestId('buy-alert-TEST:AAA')).toHaveText('1 (2)');
    await expect(page.getByTestId('sell-alert-TEST:AAA')).toHaveText('0');
    await expect(page.getByTestId('buy-signal-TEST:BBB')).toHaveText('0');
    await expect(page.getByTestId('sell-signal-TEST:BBB')).toHaveText('2');
    await expect(page.getByTestId('investment-judgment-TEST:BBB')).toHaveText('-');
    await expect(page.getByTestId('buy-alert-TEST:BBB')).toHaveText('0');
    await expect(page.getByTestId('sell-alert-TEST:BBB')).toHaveText('3 (1)');
  });

  test('保有情報と買い/売りアラート設定ボタンを条件に応じて表示できる', async ({ page }) => {
    await page.route('**/api/summaries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [
            {
              exchangeId: 'test-exchange-id',
              exchangeName: 'テスト取引所',
              date: '2026-03-02',
              summaries: [
                {
                  tickerId: 'TEST:AAA',
                  symbol: 'AAA',
                  name: 'AAA株式会社',
                  open: 100,
                  high: 110,
                  low: 95,
                  close: 105,
                  volume: 1234567,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 1,
                  sellPatternCount: 0,
                  buyAlertCount: {
                    enabled: 1,
                    disabled: 0,
                  },
                  sellAlertCount: {
                    enabled: 0,
                    disabled: 0,
                  },
                  patternDetails: [],
                  holding: {
                    quantity: 123,
                    averagePrice: 99.5,
                  },
                },
                {
                  tickerId: 'TEST:BBB',
                  symbol: 'BBB',
                  name: 'BBB株式会社',
                  open: 200,
                  high: 210,
                  low: 190,
                  close: 205,
                  volume: undefined,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 0,
                  sellPatternCount: 2,
                  buyAlertCount: {
                    enabled: 0,
                    disabled: 0,
                  },
                  sellAlertCount: {
                    enabled: 2,
                    disabled: 1,
                  },
                  patternDetails: [],
                  holding: null,
                },
              ],
            },
          ],
        }),
      });
    });

    await page.goto('/summaries');
    await expect(page.getByRole('columnheader', { name: '保有可否' })).toBeVisible();

    const firstRow = page.locator('tbody tr').nth(0);
    const secondRow = page.locator('tbody tr').nth(1);
    await expect(firstRow.locator('td').nth(2)).toHaveText('✓');
    await expect(secondRow.locator('td').nth(2)).toHaveText('-');

    await firstRow.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('保有数')).toBeVisible();
    await expect(dialog.getByText('123')).toBeVisible();
    await expect(dialog.getByText('99.50')).toBeVisible();
    await expect(dialog.getByText('出来高')).toBeVisible();
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

  test('詳細ダイアログでパターン分析の内訳と説明を表示できる', async ({ page }) => {
    await page.route('**/api/summaries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [
            {
              exchangeId: 'test-exchange-id',
              exchangeName: 'テスト取引所',
              date: '2026-03-02',
              summaries: [
                {
                  tickerId: 'TEST:AAA',
                  symbol: 'AAA',
                  name: 'AAA株式会社',
                  open: 100,
                  high: 110,
                  low: 95,
                  close: 105,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 1,
                  sellPatternCount: 0,
                  patternDetails: [
                    {
                      patternId: 'morning-star',
                      name: '三川明けの明星',
                      description:
                        '強い買いシグナル。3本のローソク足で構成され、下降トレンドの反転を示す。',
                      signalType: 'BUY',
                      status: 'MATCHED',
                    },
                    {
                      patternId: 'evening-star',
                      name: '三川宵の明星',
                      description:
                        '強い売りシグナル。3本のローソク足で構成され、上昇トレンドの反転を示す。',
                      signalType: 'SELL',
                      status: 'INSUFFICIENT_DATA',
                    },
                  ],
                  holding: {
                    quantity: 20,
                    averagePrice: 101.25,
                  },
                },
              ],
            },
          ],
        }),
      });
    });

    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('パターン分析')).toBeVisible();

    const buyArea = dialog.getByTestId('pattern-analysis-buy');
    const sellArea = dialog.getByTestId('pattern-analysis-sell');
    await expect(buyArea.getByText('三川明けの明星')).toBeVisible();
    await expect(sellArea.getByText('三川宵の明星')).toBeVisible();
    await expect(dialog.getByText('包み陽線')).toHaveCount(0);
    await expect(dialog.getByText('包み陰線')).toHaveCount(0);
    await expect(dialog.getByText('ハンマー')).toHaveCount(0);
    await expect(dialog.getByText('首吊り線')).toHaveCount(0);

    await buyArea.getByText('三川明けの明星').hover();
    await expect(page.getByRole('tooltip')).toContainText(
      '強い買いシグナル。3本のローソク足で構成され、下降トレンドの反転を示す。'
    );

    await expect(sellArea.getByText('三川宵の明星')).toHaveAttribute(
      'aria-label',
      '強い売りシグナル。3本のローソク足で構成され、上昇トレンドの反転を示す。'
    );

    await expect(sellArea.getByTestId('pattern-status-evening-star')).toHaveText('-');
    await expect(buyArea.getByTestId('pattern-status-morning-star')).toHaveText('✓');
    await expect(sellArea.getByText('理由: データ不足')).toBeVisible();

    // SC-004: 一覧の買い件数とダイアログのMATCHED BUYパターン数が一致すること
    const buyCountInList = await page.getByTestId('buy-signal-TEST:AAA').textContent();
    const matchedBuyRows = await buyArea
      .locator('[data-testid^="pattern-status-"]')
      .filter({ hasText: '✓' })
      .count();
    expect(Number(buyCountInList ?? '0')).toBe(matchedBuyRows);

    // SC-004: 一覧の売り件数とダイアログのMATCHED SELLパターン数が一致すること
    const sellCountInList = await page.getByTestId('sell-signal-TEST:AAA').textContent();
    const matchedSellRows = await sellArea
      .locator('[data-testid^="pattern-status-"]')
      .filter({ hasText: '✓' })
      .count();
    expect(Number(sellCountInList ?? '0')).toBe(matchedSellRows);
  });

  test('詳細ダイアログとアラート設定ダイアログでチャートを表示できる', async ({ page }) => {
    await page.route('**/api/summaries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSingleTickerSummaryResponse()),
      });
    });

    // TradingView への実疎通は環境によって 504 になりうるため、`/api/chart/**` を固定応答に
    // 差し替えてチャート描画を決定的に成功させる（chart-display.spec.ts と同じ方針）。
    // 旧実装は実疎通のまま「チャートが出るか、エラー表示が出るか」を OR で許容しており、
    // 描画が壊れても green になる形骸化だった。
    await page.route('**/api/chart/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildChartResponse()),
      });
    });

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
    await page.route('**/api/summaries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSingleTickerSummaryResponse()),
      });
    });

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

  test('詳細ダイアログでAI解析セクションを表示できる', async ({ page }) => {
    await page.route('**/api/summaries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [
            {
              exchangeId: 'test-exchange-id',
              exchangeName: 'テスト取引所',
              date: '2026-03-02',
              summaries: [
                {
                  tickerId: 'TEST:AAA',
                  symbol: 'AAA',
                  name: 'AAA株式会社',
                  open: 100,
                  high: 110,
                  low: 95,
                  close: 105,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 0,
                  sellPatternCount: 0,
                  patternDetails: [],
                  aiAnalysisResult: {
                    priceMovementAnalysis: 'テスト用の値動き分析です。',
                    patternAnalysis: 'テスト用のパターン分析です。',
                    supportLevels: [100, 99, 98],
                    resistanceLevels: [110, 111, 112],
                    relatedMarketTrend: 'テスト用の市場動向です。',
                    investmentJudgment: { signal: 'NEUTRAL', reason: '様子見です。' },
                  },
                  holding: null,
                },
              ],
            },
          ],
        }),
      });
    });

    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('AI 解析')).toBeVisible();
    await expect(dialog.getByText('当日の値動き分析')).toBeVisible();
    await expect(dialog.getByText('テスト用の値動き分析です。')).toBeVisible();
    await expect(dialog.getByText('中立')).toBeVisible();
  });

  test('サポート/レジスタンスチップをクリックして価格プリセット済みアラートを設定できる', async ({
    page,
  }) => {
    await page.route('**/api/summaries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [
            {
              exchangeId: 'test-exchange-id',
              exchangeName: 'テスト取引所',
              date: '2026-03-02',
              summaries: [
                {
                  tickerId: 'TEST:AAA',
                  symbol: 'AAA',
                  name: 'AAA株式会社',
                  open: 100,
                  high: 115,
                  low: 95,
                  close: 105,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 0,
                  sellPatternCount: 0,
                  patternDetails: [],
                  aiAnalysisResult: {
                    priceMovementAnalysis: 'テスト用の値動き分析です。',
                    patternAnalysis: 'テスト用のパターン分析です。',
                    supportLevels: [100, 99, 98],
                    resistanceLevels: [110, 111, 112],
                    relatedMarketTrend: 'テスト用の市場動向です。',
                    investmentJudgment: { signal: 'NEUTRAL', reason: '様子見です。' },
                  },
                  holding: null,
                },
              ],
            },
          ],
        }),
      });
    });

    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const dialog = page.getByRole('dialog');

    // サポートレベルのチップをクリック → Buy/Sell 選択メニューが表示される
    const supportChip = dialog.getByText('100', { exact: true }).first();
    await supportChip.click();
    await expect(page.getByRole('menuitem', { name: '買いアラートを設定' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '売りアラートを設定' })).toBeVisible();

    // 「買いアラートを設定」を選択 → 買いアラートモーダルが開き、価格 100 がプリセットされる
    await page.getByRole('menuitem', { name: '買いアラートを設定' }).click();
    const buyAlertDialog = page.getByRole('dialog', { name: 'アラート設定 (買いアラート)' });
    await expect(buyAlertDialog).toBeVisible();
    await expect(buyAlertDialog.getByLabel('目標価格')).toHaveValue('100');
    await page.keyboard.press('Escape');
    await expect(buyAlertDialog).toHaveCount(0);

    // レジスタンスレベルのチップをクリック → Buy/Sell 選択メニューが表示される
    const resistanceChip = dialog.getByText('110', { exact: true }).first();
    await resistanceChip.click();
    await expect(page.getByRole('menuitem', { name: '買いアラートを設定' })).toBeVisible();

    // 「売りアラートを設定」を選択 → 売りアラートモーダルが開き、価格 110 がプリセットされる
    await page.getByRole('menuitem', { name: '売りアラートを設定' }).click();
    const sellAlertDialog = page.getByRole('dialog', { name: 'アラート設定 (売りアラート)' });
    await expect(sellAlertDialog).toBeVisible();
    await expect(sellAlertDialog.getByLabel('目標価格')).toHaveValue('110');
    await page.keyboard.press('Escape');
  });

  test('詳細ダイアログがモバイル幅で画面内に収まる', async ({ page }) => {
    await page.route('**/api/summaries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [
            {
              exchangeId: 'test-exchange-id',
              exchangeName: 'テスト取引所',
              date: '2026-03-02',
              summaries: [
                {
                  tickerId: 'TEST:AAA',
                  symbol: 'AAA',
                  name: 'AAA株式会社',
                  open: 100,
                  high: 110,
                  low: 95,
                  close: 105,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 1,
                  sellPatternCount: 0,
                  patternDetails: [],
                  aiAnalysisResult: {
                    priceMovementAnalysis: LONG_TEXTS_FOR_MOBILE_DIALOG_TEST.priceMovementAnalysis,
                    patternAnalysis: LONG_TEXTS_FOR_MOBILE_DIALOG_TEST.patternAnalysis,
                    supportLevels: [100, 99, 98],
                    resistanceLevels: [110, 111, 112],
                    relatedMarketTrend: LONG_TEXTS_FOR_MOBILE_DIALOG_TEST.relatedMarketTrend,
                    investmentJudgment: {
                      signal: 'NEUTRAL',
                      reason: LONG_TEXTS_FOR_MOBILE_DIALOG_TEST.investmentReason,
                    },
                  },
                  holding: {
                    quantity: 1,
                    averagePrice: 100,
                  },
                },
              ],
            },
          ],
        }),
      });
    });
    await page.route('**/api/chart/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tickerId: 'TEST:AAA',
          symbol: 'AAA',
          timeframe: 'D',
          data: [
            { time: 1710000000000, open: 100, high: 110, low: 95, close: 105, volume: 1000000 },
          ],
        }),
      });
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/summaries');
    await page.locator('tbody tr').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

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
    await page.route('**/api/summaries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [
            {
              exchangeId: 'test-exchange-id',
              exchangeName: 'テスト取引所',
              date: '2026-03-02',
              summaries: [
                {
                  tickerId: 'TEST:AAA',
                  symbol: 'AAA',
                  name: 'AAA株式会社',
                  open: 100,
                  high: 110,
                  low: 95,
                  close: 105,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 0,
                  sellPatternCount: 0,
                  patternDetails: [],
                  holding: null,
                },
              ],
            },
          ],
        }),
      });
    });

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

    // クライアントセッションも明示的に固定する。`.env.test` の TEST_USER_ROLES が
    // 偶然 stock-admin なので従来は素通りしていたが、環境変数の既定値に依存した
    // 「たまたま通る」状態だった。stubClientSessionRoles の JSDoc も参照。
    test.beforeEach(async ({ page }) => {
      await stubClientSessionRoles(page, ['stock-admin']);
    });

    test('サマリー更新ボタンが表示される', async ({ page }) => {
      await page.goto('/summaries');
      await expect(page.getByRole('button', { name: 'サマリー更新' })).toBeVisible();
    });

    test('更新ボタンでバッチをキックした後に詳細ダイアログでAI解析セクションを表示できる', async ({
      page,
    }) => {
      await page.route('**/api/summaries', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            exchanges: [
              {
                exchangeId: 'test-exchange-id',
                exchangeName: 'テスト取引所',
                date: '2026-03-02',
                summaries: [
                  {
                    tickerId: 'TEST:AAA',
                    symbol: 'AAA',
                    name: 'AAA株式会社',
                    open: 100,
                    high: 110,
                    low: 95,
                    close: 105,
                    updatedAt: '2026-03-02T00:00:00.000Z',
                    buyPatternCount: 0,
                    sellPatternCount: 0,
                    patternDetails: [],
                    aiAnalysisResult: {
                      priceMovementAnalysis: '更新後の値動き分析です。',
                      patternAnalysis: '更新後のパターン分析です。',
                      supportLevels: [200, 199, 198],
                      resistanceLevels: [210, 211, 212],
                      relatedMarketTrend: '更新後の市場動向です。',
                      investmentJudgment: { signal: 'BULLISH', reason: '上昇基調です。' },
                    },
                    holding: null,
                  },
                ],
              },
            ],
          }),
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
      await page.getByRole('button', { name: 'サマリー更新' }).click();

      await page.locator('tbody tr').first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('AI 解析')).toBeVisible();
      await expect(dialog.getByText('当日の値動き分析')).toBeVisible();
      await expect(dialog.getByText('更新後の値動き分析です。')).toBeVisible();
      await expect(dialog.getByText('強気')).toBeVisible();
    });
  });

  test.describe('サマリー更新ボタン - stock-viewer ロール', () => {
    test.use({ role: ['stock-viewer'] });

    test('サマリー更新ボタンが表示されない', async ({ page }) => {
      await stubClientSessionRoles(page, ['stock-viewer']);

      await page.goto('/summaries');
      await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();

      // セッションが stock-viewer として解決されたうえでボタンが無いことを検証する。
      // 取引所フィルタは権限に依存せず常に描画されるため、これが見えた時点で
      // クライアント側の描画は完了している。
      await expect(page.locator('#exchange-filter')).toBeVisible();
      await expect(page.getByRole('button', { name: 'サマリー更新' })).toHaveCount(0);
    });
  });
});
