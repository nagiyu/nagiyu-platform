import { test as base, expect, type Locator, type Page } from '@playwright/test';
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

/**
 * 乗り換え変換の入力欄にテキストを入力し、変換ボタンが操作可能になるまで待つ。
 *
 * ## なぜ専用ヘルパが必要か（実測に基づく）
 *
 * 変換ボタンは `disabled={!inputText.trim()}` で、React の state が入力を認識して初めて
 * enabled になる。ところが hydration が完了する前の textarea は SSR 出力そのままの
 * 素の HTML 要素なので、`fill()` は **DOM の value だけを書き換えて onChange を発火せず**、
 * React の state は空のままボタンは disabled で固定される。
 *
 * webkit-mobile で実測した挙動:
 * - `goto` 直後に `fill()`: `inputValue()` は 186 文字（正しい）だが、ボタンは disabled
 * - `goto` → `waitForLoadState('networkidle')` → `fill()`: ボタンは enabled
 *
 * つまり DOM 上は入力できているため「値は入っているのにボタンが押せない」という
 * 分かりにくい失敗になる。旧 `dismissMigrationDialogIfVisible` は内部で
 * `waitForTimeout(1000)` → `waitForLoadState('networkidle')` → `waitForTimeout(500)` を
 * 実行しており、これが偶然 hydration 待ちとして機能していた。決定的な
 * `suppressMigrationDialog` に置き換えた際にこの暗黙の待ちが失われ、webkit-mobile で
 * 18 件が失敗した。
 *
 * ここでは hydration の完了を待ってから入力し、さらに `expect.toPass()` で
 * 「入力 → ボタンが enabled になる」を冪等に再試行して、**ボタンが操作可能になるという
 * 単一の結末**へ収束させる。結末を分岐させるものではなく、enabled にならなければ
 * タイムアウトで失敗する。
 *
 * @param page - Playwright の Page
 * @param inputField - 入力欄の Locator
 * @param text - 入力するテキスト
 * @returns 変換ボタンの Locator
 */
export async function fillTransitInput(
  page: Page,
  inputField: Locator,
  text: string
): Promise<Locator> {
  const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });

  // hydration 前に fill しても onChange が発火しないため、先に読み込み完了を待つ。
  await page.waitForLoadState('networkidle');
  await expect(inputField).toBeVisible();

  await expect(async () => {
    await inputField.fill(text);
    await expect(convertButton).toBeEnabled({ timeout: 2000 });
  }).toPass({ timeout: 20000 });

  return convertButton;
}
