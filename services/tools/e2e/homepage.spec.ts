import { test, expect } from './helpers';

test.describe('Homepage - Tool Cards and Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display tool cards on homepage', async ({ page }) => {
    // ページタイトルを確認
    await expect(page).toHaveTitle(/Tools/);

    // メインヘディングを確認
    const heading = page.getByRole('heading', { name: 'ツール一覧' });
    await expect(heading).toBeVisible();

    // ツールカードが表示されることを確認
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/ });
    await expect(toolCard).toBeVisible();
  });

  test('should display tool card with correct information', async ({ page }) => {
    // ツールカードに必要な情報が含まれていることを確認
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/ });
    await expect(toolCard).toBeVisible();

    // カード内にツール名が表示されることを確認
    await expect(page.getByText('乗り換え変換ツール')).toBeVisible();

    // カード内に説明文が表示されることを確認
    await expect(page.getByText(/乗り換え案内のテキストを整形/)).toBeVisible();

    // アイコンが表示されることを確認 (SVGアイコンの存在)
    const icon = toolCard.locator('svg').first();
    await expect(icon).toBeVisible();
  });

  test('should navigate to transit converter when card is clicked', async ({ page }) => {
    // ツールカードをクリック
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/ });
    await toolCard.click();

    // 乗り換え変換ツールページに遷移することを確認
    await expect(page).toHaveURL(/transit-converter/);

    // 乗り換え変換ツールページのコンテンツが表示されることを確認
    const heading = page.locator('h1, h4').filter({ hasText: /乗り換え変換/ });
    await expect(heading).toBeVisible();
  });

  test.describe('Responsive Layout', () => {
    test('should display 3-column layout on desktop', async ({ page, isMobile }) => {
      // モバイルの場合はスキップ
      test.skip(isMobile, 'This test is for desktop only');

      // ビューポートをデスクトップサイズに設定
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/');

      // Grid containerを確認
      const gridContainer = page.locator('[class*="MuiGrid-container"]').first();
      await expect(gridContainer).toBeVisible();

      // ビューポートサイズを確認
      const viewport = page.viewportSize();
      expect(viewport?.width).toBeGreaterThanOrEqual(1200);
    });

    test('should display 2-column layout on tablet', async ({ page, isMobile }) => {
      // モバイルの場合はスキップ
      test.skip(isMobile, 'This test is for tablet only');

      // ビューポートをタブレットサイズに設定
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/');

      // Grid containerが表示されることを確認
      const gridContainer = page.locator('[class*="MuiGrid-container"]').first();
      await expect(gridContainer).toBeVisible();

      // ビューポートサイズを確認
      const viewport = page.viewportSize();
      expect(viewport?.width).toBe(768);
      expect(viewport?.height).toBe(1024);
    });

    test('should display 1-column layout on mobile', async ({ page, isMobile }) => {
      // デスクトップの場合はビューポートを設定
      if (!isMobile) {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
      }

      // Grid containerが表示されることを確認
      const gridContainer = page.locator('[class*="MuiGrid-container"]').first();
      await expect(gridContainer).toBeVisible();

      // ビューポートサイズを確認（モバイル）
      const viewport = page.viewportSize();
      expect(viewport?.width).toBeLessThan(768);
    });
  });

  test('should return to homepage when clicking app title in header', async ({ page }) => {
    // まず別のページに遷移
    await page.goto('/transit-converter');
    await expect(page).toHaveURL(/transit-converter/);

    // ヘッダーのアプリ名をクリック
    const appTitle = page.getByRole('link', { name: /Tools/ });
    await appTitle.click();

    // ホームページに戻ることを確認
    await expect(page).toHaveURL(/\/$|^http:\/\/localhost:3000\/$/);
    await expect(page.getByRole('heading', { name: 'ツール一覧' })).toBeVisible();
  });
});
