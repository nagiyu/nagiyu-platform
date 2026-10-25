import type { Locator, Page } from '@playwright/test';
import { test, expect, resetState } from './fixtures';

/**
 * 取引所管理・アラート一覧の表が、狭い画面と長い文字列でも崩れないことを検証する。
 *
 * 表は TableContainer の横スクロールで見せる前提なので、検証するのは次の 3 点。
 * - 見出しが折り返さず 1 行で表示される
 * - 長い文字列があっても、操作列のボタンが表の中のスクロールで届く（ページ自体は横に広がらない）
 * - 0 件のときの文言が表の外に出て、画面内に見える
 *
 * `resetState` はサービス全体のインメモリストアを消す破壊的操作のため、他の spec と同様に
 * ファイル内を直列化し、終了時にストアを空へ戻す。ファイル間の並列は CI（workers=1）でのみ
 * 安全なので、ローカルでは `--workers=1` を付けて実行すること。
 */
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ playwright }) => {
  const context = await playwright.request.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });
  await resetState(context);
  await context.dispose();
});

// 空白が無く折り返しの手がかりが無い長い文字列（日本語は文字間で折り返せるため英数字にする）
const LONG_NAME = 'LongExchangeName'.repeat(7);
const LONG_SYMBOL = 'LONGSYMBOL'.repeat(6);
const LONG_TICKER_NAME = 'LongTickerName'.repeat(8);

/** 要素の中のテキストが何行に描画されているかを返す（子要素のボックスは数えない） */
async function countLines(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const tops = new Set<number>();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        tops.add(Math.round(rect.top));
      }
    }
    return tops.size;
  });
}

/** ページ全体が横に広がっていないこと（表の幅は TableContainer の中に閉じている） */
async function expectNoPageOverflow(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(viewport!.width);
}

/** 見出しセルがすべて 1 行で描画されていること */
async function expectHeadersOnSingleLine(table: Locator): Promise<void> {
  const headers = table.locator('thead th');
  const count = await headers.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    expect(await countLines(headers.nth(i))).toBe(1);
  }
}

/** 表を右端までスクロールし、操作列の 2 つのボタンがスクロール領域の中に収まり同じ行にあること */
async function expectActionButtonsReachable(table: Locator, row: Locator): Promise<void> {
  const container = table.locator(
    'xpath=ancestor::div[contains(@class, "MuiTableContainer-root")]'
  );
  await container.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });

  const containerRect = await container.boundingBox();
  const editRect = await row.getByRole('button', { name: '編集' }).boundingBox();
  const deleteRect = await row.getByRole('button', { name: '削除' }).boundingBox();
  expect(containerRect).not.toBeNull();
  expect(editRect).not.toBeNull();
  expect(deleteRect).not.toBeNull();

  for (const rect of [editRect!, deleteRect!]) {
    expect(rect.x).toBeGreaterThanOrEqual(containerRect!.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(containerRect!.x + containerRect!.width);
  }
  // ボタンが折り返して縦に並ばないこと
  expect(Math.abs(editRect!.y - deleteRect!.y)).toBeLessThan(editRect!.height / 2);
}

/** 要素が画面内（横方向）に完全に収まっていること */
async function expectWithinViewport(page: Page, locator: Locator): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport!.width);
}

function exchangeEntity(name: string) {
  return {
    exchangeId: 'E2E-LAYOUT-EX',
    name,
    key: 'E2ELAYOUT',
    timezone: 'America/New_York',
    start: '09:30',
    end: '16:00',
    priceSource: 'tradingview',
  };
}

function alertFixture(overrides: Record<string, unknown> = {}) {
  return {
    alertId: 'alert-layout-1',
    tickerId: `E2ELAYOUT:${LONG_SYMBOL}`,
    symbol: LONG_SYMBOL,
    name: LONG_TICKER_NAME,
    mode: 'Buy',
    frequency: 'MINUTE_LEVEL',
    conditions: [{ field: 'price', operator: 'gte', value: 100 }],
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** 取引所・アラートの一覧 API を固定値で返す */
async function mockAlertApis(page: Page, alerts: unknown[]): Promise<void> {
  await page.route('**/api/exchanges', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        exchanges: [{ exchangeId: 'E2E-LAYOUT-EX', name: 'Layout Exchange', key: 'E2ELAYOUT' }],
      }),
    });
  });
  await page.route('**/api/alerts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ alerts }),
    });
  });
}

test.describe('表のレイアウト（390px 幅）', () => {
  test.describe('取引所管理', () => {
    test('見出しが 1 行で、「未設定」の市場も折り返さない', async ({ page, request }) => {
      await resetState(request, { exchanges: [exchangeEntity('Layout Exchange')] });
      await page.goto('/exchanges');

      const table = page.locator('table');
      await expect(table.getByRole('cell', { name: 'Layout Exchange' })).toBeVisible();

      await expectHeadersOnSingleLine(table);
      expect(await countLines(table.getByRole('cell', { name: '未設定' }))).toBe(1);
    });

    test('長い取引所名でも操作列のボタンが表の中のスクロールで届く', async ({ page, request }) => {
      await resetState(request, { exchanges: [exchangeEntity(LONG_NAME)] });
      await page.goto('/exchanges');

      const table = page.locator('table');
      const row = table.getByRole('row').filter({ hasText: LONG_NAME });
      await expect(row).toBeVisible();

      await expectNoPageOverflow(page);
      await expectHeadersOnSingleLine(table);
      await expectActionButtonsReachable(table, row);
    });

    test('0 件のとき、空状態の文言が画面内に見える', async ({ page, request }) => {
      await resetState(request);
      await page.goto('/exchanges');

      const table = page.locator('table');
      await expect(table).toBeVisible();
      // 見出し行は 0 件でも残る
      await expect(table.getByRole('columnheader', { name: '操作' })).toBeVisible();

      const emptyMessage = page.getByText('取引所が登録されていません');
      await expect(emptyMessage).toBeVisible();
      await expectWithinViewport(page, emptyMessage);
      // 文言は表の中の行ではなく、表の外に置かれる
      await expect(table.getByText('取引所が登録されていません')).toHaveCount(0);
    });
  });

  test.describe('アラート一覧', () => {
    test('見出しが 1 行で、長いティッカーでも操作列のボタンが表の中のスクロールで届く', async ({
      page,
    }) => {
      await mockAlertApis(page, [alertFixture()]);
      await page.goto('/alerts');

      const table = page.getByRole('table', { name: 'アラート一覧' });
      const row = table.getByRole('row').filter({ hasText: LONG_SYMBOL });
      await expect(row).toBeVisible();

      await expectNoPageOverflow(page);
      await expectHeadersOnSingleLine(table);
      await expectActionButtonsReachable(table, row);
    });

    test('0 件のとき、空状態の文言が画面内に見える', async ({ page }) => {
      await mockAlertApis(page, []);
      await page.goto('/alerts');

      const table = page.getByRole('table', { name: 'アラート一覧' });
      await expect(table).toBeVisible();
      await expect(table.getByRole('columnheader', { name: '操作' })).toBeVisible();

      const emptyMessage = page.getByText('アラートがありません', { exact: true });
      await expect(emptyMessage).toBeVisible();
      await expectWithinViewport(page, emptyMessage);
      await expect(table.getByText('アラートがありません')).toHaveCount(0);
    });

    test('フィルタで 0 件になったとき、空状態の文言が画面内に見える', async ({ page }) => {
      await mockAlertApis(page, [alertFixture({ symbol: 'FILTERED', name: 'Filtered' })]);
      await page.goto('/alerts');

      await expect(page.locator('tbody td', { hasText: 'FILTERED' }).first()).toBeVisible();
      await page.getByLabel('モードフィルタ').selectOption('Sell');

      const emptyMessage = page.getByText('フィルタ条件に一致するアラートがありません');
      await expect(emptyMessage).toBeVisible();
      await expectWithinViewport(page, emptyMessage);
    });
  });
});
