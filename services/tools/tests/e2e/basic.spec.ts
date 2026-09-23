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

test.describe('Tools App - Basic Functionality', () => {
  test('should load the homepage', async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');

    // Check if the page title is correct
    await expect(page).toHaveTitle(/Tools/);

    // Check if the main heading exists
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('should navigate to transit converter', async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');

    // ホームページのツールカードから乗り換え変換ツールへ遷移できることを検証する
    // (以前はリンクの有無で分岐しており、リンクが無くても green になる形骸化テストだった)
    const transitLink = page.getByRole('link', { name: /乗り換え/i });
    await expect(transitLink.first()).toBeVisible();
    await transitLink.first().click();
    await expect(page).toHaveURL(/transit-converter/);
  });

  test('should have responsive layout on mobile', async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');

    // Verify the page loads successfully
    // Note: viewport サイズ自体は Playwright の project 設定が決めるものであり、
    // ここで viewport.width を再アサートしても config の値を確認し直すだけの
    // トートロジーになるため削除した（desktop project では何も検証しない片手落ちでもあった）。
    await expect(page.locator('body')).toBeVisible();
  });
});
