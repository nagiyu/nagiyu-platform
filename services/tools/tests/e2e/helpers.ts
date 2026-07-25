import { test as base, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * MigrationDialog（初回訪問時の移行案内ダイアログ）の表示可否を制御する
 * localStorage キー。
 * services/tools/src/components/dialogs/MigrationDialog.tsx の STORAGE_KEY と一致させること。
 */
const MIGRATION_DIALOG_STORAGE_KEY = 'tools-migration-dialog-shown';

/**
 * Extended test fixture with accessibility testing support
 */
export const test = base.extend({
  /**
   * Automatically run accessibility tests on each page
   */
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = () =>
      new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    await use(makeAxeBuilder);
  },
});

export { expect } from '@playwright/test';

/**
 * Helper function to wait for network idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 5000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Helper function to take screenshot with timestamp
 */
export async function takeTimestampedScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `screenshots/${name}-${timestamp}.png` });
}

/**
 * MigrationDialog が表示されない状態を確定させる。
 *
 * MigrationDialog の表示可否は localStorage の `tools-migration-dialog-shown` キー
 * （MigrationDialog.tsx の STORAGE_KEY）のみで決まる。以前はこの関数が
 * 「ダイアログが出たら閉じる、出なければ何もしない」という分岐（`waitFor(...).catch(() => false)`
 * による握り潰し）で対応しており、どちらに転んでもテストが green になる形骸化した実装だった。
 *
 * 状態を先に固定してしまえば「ダイアログは絶対に出ない」という単一の結末に倒せるため、
 * こちらに置き換える。
 *
 * `page.addInitScript` はページの新しいドキュメントが生成されるたびに実行されるため、
 * `page.goto` より前に一度呼び出しておけば、その後の `reload()` や `localStorage.clear()`
 * を挟んだ再ナビゲーションでも効果が持続する（次のドキュメント読み込み前に再実行され、
 * MigrationDialog の useEffect が走るより先にフラグが立つ）。
 *
 * @param page - Playwright の Page。**`page.goto` を呼び出す前に**呼び出すこと。
 */
export async function suppressMigrationDialog(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, 'true');
  }, MIGRATION_DIALOG_STORAGE_KEY);
}
