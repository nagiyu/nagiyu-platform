import { test, expect } from './fixtures';
import type { AxisPerformanceResponse } from '../../types/forecast';

/**
 * 実 Service Worker（/sw.js）が API 応答を仲介すると page.route が効かない
 * ブラウザがあるため、本 spec では一律に無効化する。
 */
test.use({ serviceWorkers: 'block' });

/**
 * 判断軸の成績画面 E2E。
 *
 * API は `page.route()` でモックし、実 DynamoDB に依存しない。
 */

const RESPONSE_DIR: AxisPerformanceResponse = {
  question: 'DIR',
  period: '90d',
  market: 'ALL',
  from: '2026-06-30',
  to: '2026-09-24',
  evaluatedCount: 8120,
  hitRate: 0.503,
  neutralBand: { lower: 0, upper: 0.05 },
  calibration: [
    { lower: 0.45, upper: 0.5, count: 2000, meanProbability: 0.47, hitRate: 0.48 },
    { lower: 0.5, upper: 0.55, count: 12, meanProbability: 0.52, hitRate: 0.7 },
  ],
  axes: [
    {
      axisId: 'axis-a',
      name: '軸A',
      kind: 'FLAG',
      count: 1200,
      hitRate: 0.55,
      diffFromBaseline: 0.047,
      meanExcessReturn: 0.003,
      currentWeight: 0.5,
      lowSample: false,
    },
    {
      axisId: 'axis-b',
      name: '軸B',
      kind: 'NUMERIC',
      count: 20,
      hitRate: 0.45,
      diffFromBaseline: -0.053,
      meanExcessReturn: -0.001,
      currentWeight: -0.25,
      lowSample: true,
    },
  ],
};

const RESPONSE_EMPTY: AxisPerformanceResponse = {
  ...RESPONSE_DIR,
  from: null,
  to: null,
  evaluatedCount: 0,
  hitRate: 0,
  neutralBand: null,
  calibration: [],
  axes: [],
};

test.describe('判断軸の成績 (stock-viewer)', () => {
  test.use({ role: ['stock-viewer'] });

  test('主要セクションが表示される', async ({ page }) => {
    const urls: string[] = [];
    await page.route('**/api/axis-performance**', (route) => {
      urls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RESPONSE_DIR),
      });
    });

    await page.goto('/axis-performance');

    await expect(page.getByRole('heading', { name: '判断軸の成績' })).toBeVisible();
    await expect(page.getByTestId('axis-performance-headline')).toHaveText(
      '採点済み 8,120 件 ／ 基準 50.3%'
    );
    await expect(page.getByTestId('neutral-band-text')).toHaveText('基準値 +0〜+5pt は中立');
    await expect(page.getByRole('heading', { name: '確度の成績' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '軸ごとの成績' })).toBeVisible();
    await expect(page.getByTestId('calibration-row')).toHaveCount(2);
    await expect(page.getByTestId('axis-row')).toHaveCount(2);
    await expect(page.getByText('件数不足')).toBeVisible();
    expect(urls[0]).toContain('question=DIR&period=90d&market=ALL');
  });

  test('question クエリで市場の荒れタブが開き、全体は選べない', async ({ page }) => {
    const urls: string[] = [];
    await page.route('**/api/axis-performance**', (route) => {
      urls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...RESPONSE_DIR, question: 'MKT', market: 'JP' }),
      });
    });

    await page.goto('/axis-performance?question=MKT');

    await expect(page.getByRole('tab', { name: '市場の荒れ' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('button', { name: '全体' })).toHaveCount(0);
    await expect(page.getByTestId('axis-performance-headline')).toBeVisible();
    expect(urls[0]).toContain('question=MKT&period=90d&market=JP');
  });

  test('期間と市場を切り替えると再取得する', async ({ page }) => {
    const urls: string[] = [];
    await page.route('**/api/axis-performance**', (route) => {
      urls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RESPONSE_DIR),
      });
    });

    await page.goto('/axis-performance');
    await expect(page.getByTestId('axis-row')).toHaveCount(2);

    await page.getByRole('button', { name: '30 日' }).click();
    await expect.poll(() => urls[urls.length - 1]).toContain('period=30d');

    await page.getByRole('button', { name: 'US' }).click();
    await expect.poll(() => urls[urls.length - 1]).toContain('market=US');
  });

  test('軸名をクリックすると説明が出る', async ({ page }) => {
    await page.route('**/api/axis-performance**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RESPONSE_DIR),
      })
    );

    await page.goto('/axis-performance');
    await page.getByRole('button', { name: '軸A' }).click();

    await expect(page.getByRole('tooltip')).toContainText('「軸A」が点灯した予測の的中率');
    await expect(page.getByRole('tooltip')).toContainText('対象の問い: 方向');
  });

  test('採点済みが無い期間は空状態を表示する', async ({ page }) => {
    await page.route('**/api/axis-performance**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RESPONSE_EMPTY),
      })
    );

    await page.goto('/axis-performance');

    await expect(page.getByTestId('axis-performance-empty')).toHaveText(
      'この期間に採点済みの予測はありません'
    );
  });

  test('ナビゲーションに「判断軸の成績」が出て「予測精度」は出ない', async ({ page }) => {
    await page.route('**/api/axis-performance**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RESPONSE_DIR),
      })
    );

    await page.goto('/axis-performance');

    await expect(page.locator('a[href="/axis-performance"]').first()).toBeAttached();
    await expect(page.locator('a[href="/prediction-evaluation"]')).toHaveCount(0);
  });

  test('旧パス /prediction-evaluation は /axis-performance へリダイレクトされる', async ({
    page,
  }) => {
    await page.route('**/api/axis-performance**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RESPONSE_DIR),
      })
    );

    await page.goto('/prediction-evaluation');

    await expect(page).toHaveURL(/\/axis-performance$/);
    await expect(page.getByRole('heading', { name: '判断軸の成績' })).toBeVisible();
  });
});

test.describe('判断軸の成績 (stocks:read なし)', () => {
  test.use({ role: ['user-manager'] });

  test('権限エラーを表示する', async ({ page }) => {
    await page.goto('/axis-performance');

    await expect(page.getByText('判断軸の成績を表示する権限がありません。')).toBeVisible();
  });
});
