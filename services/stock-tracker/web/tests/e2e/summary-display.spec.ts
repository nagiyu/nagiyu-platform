import { test, expect } from '@playwright/test';

test.describe('サマリー画面スモークテスト', () => {
  test('サマリー一覧テーブルに買い/売りシグナル列と件数を表示できる', async ({ page }) => {
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
                },
                {
                  tickerId: 'TEST:BBB',
                  symbol: 'BBB',
                  name: 'BBB株式会社',
                  open: 200,
                  high: 210,
                  low: 190,
                  close: 205,
                  updatedAt: '2026-03-02T00:00:00.000Z',
                  buyPatternCount: 0,
                  sellPatternCount: 2,
                  patternDetails: [],
                },
              ],
            },
          ],
        }),
      });
    });

    await page.goto('/summaries');

    await expect(page.getByRole('columnheader', { name: '買いシグナル' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '売りシグナル' })).toBeVisible();

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);

    await expect(page.getByTestId('buy-signal-TEST:AAA')).toHaveText('1');
    await expect(page.getByTestId('sell-signal-TEST:AAA')).toHaveText('0');
    await expect(page.getByTestId('buy-signal-TEST:BBB')).toHaveText('0');
    await expect(page.getByTestId('sell-signal-TEST:BBB')).toHaveText('2');
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
                  patternDetails: [],
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

    await buyArea.getByText('三川明けの明星').hover();
    await expect(page.getByRole('tooltip')).toContainText(
      '強い買いシグナル。3本のローソク足で構成され、下降トレンドの反転を示す。'
    );

    await expect(sellArea.getByText('三川宵の明星')).toHaveAttribute(
      'aria-label',
      '強い売りシグナル。3本のローソク足で構成され、上昇トレンドの反転を示す。'
    );

    await expect(sellArea.getByTestId('pattern-status-evening-star')).toHaveText('判定不能');
    await expect(sellArea.getByText('理由: データ不足')).toBeVisible();
  });

  test('サマリーページの基本要素が表示される', async ({ page }) => {
    await page.goto('/summaries');

    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
    await expect(page.getByLabel('取引所')).toBeVisible();
  });

  test('ナビゲーションリンクからサマリーページに遷移できる', async ({ page }) => {
    await page.goto('/');

    const menuButton = page.getByRole('button', { name: 'メニューを開く' });
    const isMobileMenuVisible = await menuButton.isVisible();
    if (isMobileMenuVisible) {
      await menuButton.click();
    }

    if (isMobileMenuVisible) {
      const summaryLink = page
        .getByRole('navigation', { name: 'ナビゲーションメニュー' })
        .getByRole('link', { name: 'サマリー' });
      await expect(summaryLink).toBeVisible();
      await summaryLink.click();
    } else {
      const summaryLink = page.getByRole('banner').getByRole('link', { name: 'サマリー' });
      await expect(summaryLink).toBeVisible();
      await summaryLink.click();
    }

    await expect(page).toHaveURL('/summaries');
    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();
  });

  test('stock-admin の場合にサマリー更新ボタンが表示される', async ({ page }) => {
    await page.goto('/summaries');
    const isAdmin = process.env.TEST_USER_ROLES?.includes('stock-admin');
    if (isAdmin) {
      await expect(page.getByRole('button', { name: 'サマリー更新' })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'サマリー更新' })).toHaveCount(0);
    }
  });

  test('データ未投入環境ではサマリー行が0件でもページ表示できる', async ({ page }) => {
    await page.goto('/summaries');
    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();

    const rowCount = await page.locator('tbody tr').count();
    test.skip(rowCount > 0, 'サマリーデータがある環境のためスキップ');
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('行クリックでダイアログ表示できる（サマリーデータ存在時）', async ({ page }) => {
    await page.goto('/summaries');
    await expect(page.getByRole('heading', { name: '日次サマリー' })).toBeVisible();

    const firstRow = page.locator('tbody tr').first();
    const rowCount = await page.locator('tbody tr').count();
    test.skip(rowCount === 0, 'サマリーデータがない環境のためスキップ');

    await firstRow.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '閉じる' }).click();

    await expect(dialog).not.toBeVisible();
  });
});
