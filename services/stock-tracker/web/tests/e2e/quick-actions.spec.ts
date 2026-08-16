import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

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
 * クイックアクションのグリッドコンテナの列数を返す。
 *
 * `components/QuickActions.tsx` は
 * `gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }`
 * を指定しているため、計算後の `grid-template-columns` はトラック数ぶんの長さ値
 * （例: "184.5px 184.5px"）になる。空白区切りの個数がそのまま列数になる。
 *
 * 旧実装のレスポンシブ 3 テストは見出しとリンクの可視性しか見ておらず、
 * 「縦並び / 2 列 / 3 列」というテスト名の主張を検証していなかった（グリッドが
 * 崩れても green になる）。ここで実際の列数を数えて主張どおり検証する。
 */
async function getQuickActionColumnCount(page: Page): Promise<number> {
  const heading = page.getByRole('heading', { name: 'クイックアクション' });
  await expect(heading).toBeVisible();

  const grid = page
    .locator('main')
    .locator('css=[style*="grid"], .MuiBox-root')
    .filter({
      has: page.getByRole('link', { name: /保有株式管理/ }),
    });

  const templateColumns = await grid
    .last()
    .evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);

  return templateColumns.trim().split(/\s+/).filter(Boolean).length;
}

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
    await expect(page.locator('main').getByRole('link', { name: /保有株式管理/ })).toBeVisible();

    // アラート一覧ボタン
    await expect(page.locator('main').getByRole('link', { name: /アラート一覧/ })).toBeVisible();

    // サマリーボタン
    await expect(page.locator('main').getByRole('link', { name: /サマリー/ })).toBeVisible();
  });

  test('各ボタンが正しいURLにリンクしている', async ({ page }) => {
    // 保有株式管理ボタン
    const holdingsButton = page.locator('main').getByRole('link', { name: /保有株式管理/ });
    await expect(holdingsButton).toHaveAttribute('href', '/holdings');

    // アラート一覧ボタン
    const alertsButton = page.locator('main').getByRole('link', { name: /アラート一覧/ });
    await expect(alertsButton).toHaveAttribute('href', '/alerts');

    // サマリーボタン
    const summariesButton = page.locator('main').getByRole('link', { name: /サマリー/ });
    await expect(summariesButton).toHaveAttribute('href', '/summaries');
  });

  test('ボタンにアイコンが表示される', async ({ page }) => {
    // 保有株式管理ボタン内にアイコンが存在する
    const holdingsButton = page.locator('main').getByRole('link', { name: /保有株式管理/ });
    const holdingsIcon = holdingsButton.locator('svg').first();
    await expect(holdingsIcon).toBeVisible();

    // アラート一覧ボタン内にアイコンが存在する
    const alertsButton = page.locator('main').getByRole('link', { name: /アラート一覧/ });
    const alertsIcon = alertsButton.locator('svg').first();
    await expect(alertsIcon).toBeVisible();
  });
});

test.describe('クイックアクションエリア - 管理者権限 (stock-admin ロール)', () => {
  // stocks:manage-data 権限（stock-admin ロール）を固定し、
  // 管理者ボタンが表示される結末のみを検証する。
  test.use({ role: ['stock-admin'] });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // 3秒待つ (TODO: 今後修正したい)
    await page.waitForTimeout(3000);
  });

  test('管理者ボタンが表示される', async ({ page }) => {
    const exchangeButton = page.getByRole('link', { name: /取引所管理/ });
    const tickerButton = page.getByRole('link', { name: /ティッカー管理/ });

    await expect(exchangeButton).toBeVisible();
    await expect(tickerButton).toBeVisible();

    // 正しいURLにリンクしている
    await expect(exchangeButton).toHaveAttribute('href', '/exchanges');
    await expect(tickerButton).toHaveAttribute('href', '/tickers');
  });
});

test.describe('クイックアクションエリア - 一般ユーザー権限 (stock-viewer ロール)', () => {
  // stocks:manage-data 権限を持たない stock-viewer ロールを固定し、
  // 管理者ボタンが表示されない結末のみを検証する。
  test.use({ role: ['stock-viewer'] });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // 3秒待つ (TODO: 今後修正したい)
    await page.waitForTimeout(3000);
  });

  test('管理者ボタンが表示されない', async ({ page }) => {
    // docs/development/testing.md の指摘どおり、「表示されないこと」の否定 assert は
    // 対象の状態が確定する前だと無条件に通ってしまう。管理者ボタンを assert する前に、
    // 必ず表示されるはずの共通ボタンが表示されたことを先に待ち、画面の描画が
    // 完了している状態を確定させてから否定を検証する。
    await expect(page.locator('main').getByRole('link', { name: /保有株式管理/ })).toBeVisible();

    const exchangeButton = page.getByRole('link', { name: /取引所管理/ });
    const tickerButton = page.getByRole('link', { name: /ティッカー管理/ });

    await expect(exchangeButton).not.toBeVisible();
    await expect(tickerButton).not.toBeVisible();
  });
});

test.describe('クイックアクションエリア - レスポンシブ対応', () => {
  test('モバイル表示でボタンが縦並びになる', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main').getByRole('link', { name: /保有株式管理/ })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: /アラート一覧/ })).toBeVisible();

    expect(await getQuickActionColumnCount(page)).toBe(1);
  });

  test('タブレット表示でボタンが2列グリッドになる', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main').getByRole('link', { name: /保有株式管理/ })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: /アラート一覧/ })).toBeVisible();

    expect(await getQuickActionColumnCount(page)).toBe(2);
  });

  test('デスクトップ表示でボタンが3列グリッドになる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main').getByRole('link', { name: /保有株式管理/ })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: /アラート一覧/ })).toBeVisible();

    expect(await getQuickActionColumnCount(page)).toBe(3);
  });
});
