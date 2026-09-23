import { Page } from '@playwright/test';
import { test, expect, suppressMigrationDialog } from './helpers';
/**
 * chromium-mobile プロジェクトは playwright.config.base.ts 側で `serviceWorkers: 'block'` を
 * 設定済みだが、chromium-desktop / webkit-mobile は未設定という非対称がある。
 * stock-tracker / niconico-mylist-assistant では実際に Service Worker
 *（`@nagiyu/ui` の ServiceWorkerRegistration 経由で `/sw.js` を登録）を使っており、
 * webkit 環境で SW が `page.route` のモックを迂回して非決定性を生むことが実測されている
 * ため、一律に block している。
 *
 * tools サービスは manifest.json で PWA 対応を謳っているが、`layout.tsx` は
 * ServiceWorkerRegistration を組み込んでおらず `public/sw.js` も存在しないため、
 * 実際には Service Worker を一切登録しない（後述の pwa.spec.ts のコメント参照）。
 * したがって本ファイルでの `serviceWorkers: 'block'` は現時点では効果を持たない
 * （将来 SW 実装が入った際の予防的デフォルト、および他サービスとの記法統一のために付与）。
 */
test.use({ serviceWorkers: 'block' });

/**
 * ホームページのツールカードグリッド（Grid container）内で、実際に何列で
 * レイアウトされているかを数える。
 *
 * `src/app/page.tsx` は MUI Grid（v2 系。CSS Grid ではなく flexbox +
 * ブレークポイントごとの `flexBasis` で列数を実現する実装）で
 * `size={{ xs: 12, sm: 6, md: 4 }}` を指定しているため、
 * `grid-template-columns` を読んでも列数はわからない（CSS Grid を使っていないため）。
 *
 * そのため、カードリンクの bounding box を取得し、先頭カードと同じ Y 座標
 * （＝同じ行）にあるカードの数を数えることで、実際に画面上へ描画された列数を
 * 直接検証する。以前はこのグリッドの可視性としか確認しておらず、
 * 「3列 / 2列 / 1列」というテスト名の主張を実際には検証していなかった。
 */
async function getToolCardColumnCount(page: Page): Promise<number> {
  const gridContainer = page.locator('[class*="MuiGrid-container"]').first();
  await expect(gridContainer).toBeVisible();

  const cardLinks = gridContainer.locator('a[href^="/"]');
  const cardCount = await cardLinks.count();
  expect(cardCount).toBeGreaterThan(0);

  const tops = await Promise.all(
    Array.from({ length: cardCount }, async (_, i) => {
      const box = await cardLinks.nth(i).boundingBox();
      return box?.y ?? 0;
    })
  );

  const firstRowTop = tops[0];
  // 同じ行にあるカード（Y座標がほぼ一致するもの）の数 = 列数
  return tops.filter((top) => Math.abs(top - firstRowTop) < 1).length;
}

test.describe('Homepage - Tool Cards and Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');
  });

  test('should display tool cards on homepage', async ({ page }) => {
    // Check if the main heading exists
    const heading = page.getByRole('heading', { name: /Tools.*便利なツール集/i });
    await expect(heading).toBeVisible();

    // Check if tool cards are displayed
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/i });
    await expect(toolCard).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Base64 エンコーダー \/ デコーダー/i })
    ).toBeVisible();

    // Verify tool card contains description
    const description = page.getByText(
      /乗り換え案内のテキストから必要な情報を抽出し、メモやチャットに貼り付けやすい形式へ変換します。/i
    );
    await expect(description).toBeVisible();

    // Verify tool card contains icon
    const cardContent = page.locator('a[href="/transit-converter"]');
    await expect(cardContent).toBeVisible();
  });

  test('should navigate to transit converter from card', async ({ page }) => {
    // Click on the transit converter tool card
    const transitCard = page.getByRole('link', { name: /乗り換え変換ツール/i });
    await transitCard.click();

    // Verify navigation to transit converter page
    await expect(page).toHaveURL(/\/transit-converter/);

    // Verify we're on the transit converter page
    const transitHeading = page.getByRole('heading', { name: /乗り換え変換ツール/i });
    await expect(transitHeading).toBeVisible();
  });

  test('should display all tool card elements', async ({ page }) => {
    // 乗り換え変換ツールのカード
    const toolCard = page.locator('a[href="/transit-converter"]');
    await expect(toolCard).toBeVisible();

    // Verify tool name is displayed
    const toolName = toolCard.getByText('乗り換え変換ツール');
    await expect(toolName).toBeVisible();

    // Verify description is displayed
    const description = toolCard.getByText(
      /乗り換え案内のテキストから必要な情報を抽出し、メモやチャットに貼り付けやすい形式へ変換します。/i
    );
    await expect(description).toBeVisible();

    // Verify icon is present (svg element should be visible)
    const icon = toolCard.locator('svg');
    await expect(icon).toBeVisible();

    const base64Card = page.locator('a[href="/base64"]');
    await expect(base64Card).toBeVisible();
    await expect(base64Card.getByText('Base64 エンコーダー / デコーダー')).toBeVisible();
  });
});

test.describe('Homepage - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');
  });

  test('should display 3-column layout on desktop', async ({ page }) => {
    // 各テストが自前で viewport を固定しているため、project（デバイス）に依存する
    // 必要はない。以前は `project.name.includes('mobile')` で無条件に skip して
    // おり、そのプロジェクトでは何も検証していなかった。
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForLoadState('networkidle');

    expect(await getToolCardColumnCount(page)).toBe(3);
  });

  test('should display 2-column layout on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForLoadState('networkidle');

    // Verify tool cards are still visible
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/i });
    await expect(toolCard).toBeVisible();

    expect(await getToolCardColumnCount(page)).toBe(2);
  });

  test('should display 1-column layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('networkidle');

    // Verify tool cards are visible on mobile
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/i });
    await expect(toolCard).toBeVisible();

    expect(await getToolCardColumnCount(page)).toBe(1);
  });
});

test.describe('Common Components - Header and Footer', () => {
  test.beforeEach(async ({ page }) => {
    await suppressMigrationDialog(page);
  });

  test('should display header on homepage', async ({ page }) => {
    await page.goto('/');

    // Verify header is visible
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Verify app name "Tools" is displayed in header
    const appName = page.getByRole('link', { name: /Tools/i }).first();
    await expect(appName).toBeVisible();
    await expect(appName).toHaveAttribute('href', '/');
  });

  test('should display footer on homepage', async ({ page }) => {
    await page.goto('/');

    // Verify footer is visible
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Verify version information is displayed
    const version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();
  });

  test('should display header on all pages', async ({ page }) => {
    // Test on homepage
    await page.goto('/');
    let header = page.locator('header');
    await expect(header).toBeVisible();

    // Test on transit converter page
    await page.goto('/transit-converter');
    header = page.locator('header');
    await expect(header).toBeVisible();

    const appName = page.getByRole('link', { name: /Tools/i }).first();
    await expect(appName).toBeVisible();
  });

  test('should display footer on all pages', async ({ page }) => {
    // Test on homepage
    await page.goto('/');
    let footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Test on transit converter page
    await page.goto('/transit-converter');
    footer = page.locator('footer');
    await expect(footer).toBeVisible();

    const version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();
  });
});
