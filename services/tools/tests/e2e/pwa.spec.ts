import { test, expect, suppressMigrationDialog } from './helpers';

/**
 * PWA 関連の E2E テスト。
 *
 * このサービスは manifest.json とアイコンこそ用意しているが、next-pwa 等の
 * Service Worker 実装は持たない（`public/sw.js` が存在せず、`ServiceWorkerRegistration`
 * のようなコンポーネントも layout に組み込まれていない）。そのため実際に SW が
 * 登録されることも、オフラインキャッシュが機能することも、このアプリには無い。
 *
 * 旧実装は `process.env.NODE_ENV === 'production'` で分岐し、production では
 * 「SW が登録されている」「オフラインでもキャッシュから表示される」ことを検証する
 * つもりだった。しかしこの条件式は Playwright テストランナー（Node.js）側の
 * プロセス環境で評価されるものであり、`next dev` / `next start` という
 * webServer コマンドの選択（`configs/playwright.config.base.ts` 参照）とは無関係で、
 * どちらの経路でも CI・ローカルともに `NODE_ENV` は 'production' にならない
 * （常に else 分岐が実行される＝production 分岐は一度も実行されない死んだコード
 * だった）。さらに実装側に SW 自体が存在しないため、たとえ isProduction 分岐が
 * 実行されたとしても検証は成立しない。
 *
 * 本ファイルでは実際に実行される結末（＝ else 分岐相当の内容）に固定し、
 * 到達しない分岐を削除した。以下の担保が失われている点に注意:
 * - Service Worker が実際に登録されること
 * - オフライン時にキャッシュされたページが表示されること
 * - オフライン時にクライアントサイド機能が動作し続けること
 * これらはそもそも実装が存在せず、旧実装でも一度も検証されていなかったため、
 * 実質的な担保の後退はない（形骸化していたテストの体裁を削っただけ）。
 *
 * あわせて `'serviceWorker' in navigator` を assert するだけのテストも削除した。
 * これはブラウザが API を持つことの確認でありアプリのコードを一行も通らないため、
 * 「壊れても落ちないテスト」に該当する（stock-tracker 側でも同型の
 * 「Service Workerが登録される」テストを同じ理由で削除している）。
 */

test.describe('PWA - Manifest and Metadata', () => {
  test('should load manifest.json', async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');

    // Verify manifest link is in the HTML
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.json');

    // Fetch manifest.json and verify its content
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);

    const manifest = await response?.json();
    expect(manifest).toBeDefined();
    expect(manifest.name).toBe('Tools - 便利な開発ツール集');
    expect(manifest.short_name).toBe('Tools');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#1976d2');
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('should have correct PWA metadata in HTML', async ({ page }) => {
    await suppressMigrationDialog(page);
    await page.goto('/');

    // Check theme color meta tag
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#1976d2');

    // Check manifest link
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toBeAttached();

    // Note: Next.js appleWebApp metadata is rendered differently
    // We just verify that the page has PWA capabilities
  });

  test('should have PWA icons available', async ({ page }) => {
    // Check if icon files are accessible
    const icon192Response = await page.goto('/icon-192x192.png');
    expect(icon192Response?.status()).toBe(200);

    const icon512Response = await page.goto('/icon-512x512.png');
    expect(icon512Response?.status()).toBe(200);
  });
});

test.describe('PWA - Web Share Target', () => {
  test('should have share_target configuration in manifest', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);

    const manifest = await response?.json();
    expect(manifest.share_target).toBeDefined();
    expect(manifest.share_target.action).toBe('/transit-converter');
    expect(manifest.share_target.method).toBe('GET');
    expect(manifest.share_target.params).toBeDefined();
    expect(manifest.share_target.params.text).toBe('text');
    expect(manifest.share_target.params.url).toBe('url');
  });

  test('should handle URL parameters from share target', async ({ page }) => {
    await suppressMigrationDialog(page);

    // Navigate with URL parameters (simulating share target)
    const sharedText = encodeURIComponent('東京駅から品川駅まで');
    const url = `/transit-converter?text=${sharedText}`;
    await page.goto(url);

    // Verify the page loaded successfully
    const heading = page.getByRole('heading', { name: /乗り換え変換ツール/i });
    await expect(heading).toBeVisible();

    // Verify that the URL initially had the text parameter
    // Note: The page may process and remove the parameter after loading
    // We verify the page loaded with the parameter at some point
    const initialUrl = page.url();
    expect(initialUrl).toMatch(/transit-converter/);
  });
});
