import { test, expect } from '@playwright/test';
import type { SummaryResponse } from '../../lib/prediction-evaluation/types';

/**
 * 予測精度ダッシュボード E2E。
 *
 * API は `page.route()` でモックし、実 DynamoDB / Lambda に依存しない。
 * `SKIP_AUTH_CHECK=true` の E2E 環境でテストユーザー（stock-admin）として
 * 表示できる前提。
 */

const SUMMARY_WITH_DATA: SummaryResponse = {
  period: '30d',
  evaluatedAt: 1_000_000,
  kpi: { totalAccuracy: 65.0, directionalAccuracy: 63.0, judgedCount: 40 },
  dailyTrend: [{ date: '2026-05-10', directionalAccuracy: 63.0, judgedCount: 10 }],
  bySignal: [
    { signal: 'BULLISH', accuracy: 70.0, count: 20 },
    { signal: 'NEUTRAL', accuracy: 50.0, count: 10 },
    { signal: 'BEARISH', accuracy: 60.0, count: 10 },
  ],
};

const SUMMARY_EMPTY: SummaryResponse = {
  period: 'all',
  evaluatedAt: 1_000_000,
  kpi: { totalAccuracy: null, directionalAccuracy: null, judgedCount: 0 },
  dailyTrend: [],
  bySignal: [
    { signal: 'BULLISH', accuracy: null, count: 0 },
    { signal: 'NEUTRAL', accuracy: null, count: 0 },
    { signal: 'BEARISH', accuracy: null, count: 0 },
  ],
};

test.describe('予測精度ダッシュボード', () => {
  test('ダッシュボードの主要セクションが表示される', async ({ page }) => {
    await page.route('**/api/prediction-evaluation/summary**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SUMMARY_WITH_DATA),
      });
    });

    await page.goto('/prediction-evaluation');

    await expect(page.getByRole('heading', { name: '予測精度ダッシュボード' })).toBeVisible();

    // 主要指標テキスト（見出し直下）
    await expect(page.getByTestId('summary-headline')).toContainText('方向精度');

    // 期間セレクター
    await expect(page.getByLabel('集計期間')).toBeVisible();

    // セクション見出し
    await expect(page.getByRole('heading', { name: '日次の方向精度推移' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'シグナル別の精度' })).toBeVisible();
  });

  test('期間を切り替えると API リクエストが更新され主要指標テキストが変わる', async ({ page }) => {
    await page.route('**/api/prediction-evaluation/summary**', async (route) => {
      const url = new URL(route.request().url());
      const period = url.searchParams.get('period') ?? '30d';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...SUMMARY_WITH_DATA, period }),
      });
    });

    await page.goto('/prediction-evaluation');

    const headline = page.getByTestId('summary-headline');
    await expect(headline).toContainText('直近 30 日');

    await page.getByLabel('集計期間').selectOption('7d');

    await expect(headline).toContainText('直近 7 日');
  });

  test('API が空データを返すと「採点済みの予測がありません」と表示される', async ({ page }) => {
    await page.route('**/api/prediction-evaluation/summary**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SUMMARY_EMPTY),
      });
    });

    await page.goto('/prediction-evaluation');

    await expect(page.getByTestId('summary-headline')).toContainText('採点済みの予測がありません');
  });

  test('API がサーバーエラーを返すとエラーアラートが表示される', async ({ page }) => {
    await page.route('**/api/prediction-evaluation/summary**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'INTERNAL_ERROR', message: 'サーバーエラー' }),
      });
    });

    await page.goto('/prediction-evaluation');

    await expect(page.getByText(/サーバーエラー/)).toBeVisible();
  });
});
