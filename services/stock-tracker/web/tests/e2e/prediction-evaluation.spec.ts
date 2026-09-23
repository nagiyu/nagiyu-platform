import { test, expect } from '@playwright/test';
import type { SummaryResponse } from '../../lib/prediction-evaluation/types';

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
 * 予測精度ダッシュボード E2E。
 *
 * API は `page.route()` でモックし、実 DynamoDB / Lambda に依存しない。
 * `SKIP_AUTH_CHECK=true` の E2E 環境でテストユーザー（stock-admin）として
 * 表示できる前提。
 */

const SUMMARY_WITH_DATA: SummaryResponse = {
  period: '30d',
  evaluatedAt: 1_000_000,
  threshold: 0.5,
  kpi: { totalAccuracy: 65.0, directionalAccuracy: 63.0, judgedCount: 40, neutralRatio: 25.0 },
  dailyTrend: [{ date: '2026-05-10', directionalAccuracy: 63.0, judgedCount: 10 }],
  baseline: { upRate: 40.0, downRate: 35.0, flatRate: 25.0 },
  bySignal: [
    { signal: 'BULLISH', accuracy: 70.0, count: 20, baseline: 40.0, edge: 30.0 },
    { signal: 'NEUTRAL', accuracy: 50.0, count: 10, baseline: 25.0, edge: 25.0 },
    { signal: 'BEARISH', accuracy: 60.0, count: 10, baseline: 35.0, edge: 25.0 },
  ],
};

const SUMMARY_EMPTY: SummaryResponse = {
  period: 'all',
  evaluatedAt: 1_000_000,
  threshold: 0.5,
  kpi: { totalAccuracy: null, directionalAccuracy: null, judgedCount: 0, neutralRatio: null },
  dailyTrend: [],
  baseline: { upRate: null, downRate: null, flatRate: null },
  bySignal: [
    { signal: 'BULLISH', accuracy: null, count: 0, baseline: null, edge: null },
    { signal: 'NEUTRAL', accuracy: null, count: 0, baseline: null, edge: null },
    { signal: 'BEARISH', accuracy: null, count: 0, baseline: null, edge: null },
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
