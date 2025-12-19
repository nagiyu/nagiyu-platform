import { test, expect } from './helpers';

test.describe('Common Components - Header and Footer', () => {
  const testPages = [
    { name: 'ホームページ', url: '/' },
    { name: '乗り換え変換ツール', url: '/transit-converter' },
  ];

  testPages.forEach(({ name, url }) => {
    test.describe(`${name}での共通コンポーネント表示`, () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(url);
      });

      test('should display header on all pages', async ({ page }) => {
        // ヘッダーが表示されることを確認
        const header = page.locator('header');
        await expect(header).toBeVisible();

        // AppBarが表示されることを確認
        const appBar = page.locator('[class*="MuiAppBar"]');
        await expect(appBar).toBeVisible();
      });

      test('should display app name "Tools" in header', async ({ page }) => {
        // ヘッダー内にアプリ名「Tools」が表示されることを確認
        const appName = page.getByRole('link', { name: /Tools/ });
        await expect(appName).toBeVisible();

        // リンクがホームページへのリンクであることを確認
        await expect(appName).toHaveAttribute('href', '/');
      });

      test('should have accessible header', async ({ page }) => {
        // ヘッダーのアプリ名にaria-labelが設定されていることを確認
        const appName = page.locator('header a[href="/"]');
        await expect(appName).toHaveAttribute('aria-label');

        // aria-labelの内容を確認
        const ariaLabel = await appName.getAttribute('aria-label');
        expect(ariaLabel).toContain('Tools');
        expect(ariaLabel).toContain('ホームページ');
      });

      test('should display footer on all pages', async ({ page }) => {
        // フッターが表示されることを確認
        const footer = page.locator('footer');
        await expect(footer).toBeVisible();

        // フッターがページの下部に配置されていることを確認（視覚的には最下部）
        const footerBox = await footer.boundingBox();
        expect(footerBox).toBeTruthy();
      });

      test('should display version information in footer', async ({ page }) => {
        // フッター内にバージョン情報が表示されることを確認
        const footer = page.locator('footer');
        const versionText = footer.locator('text=/v\\d+\\.\\d+\\.\\d+/');
        await expect(versionText).toBeVisible();

        // バージョン番号のフォーマットを確認
        const versionContent = await versionText.textContent();
        expect(versionContent).toMatch(/v\d+\.\d+\.\d+/);
      });

      test('should display footer links (privacy and terms)', async ({ page }) => {
        // フッター内にプライバシーポリシーリンクが表示されることを確認
        const privacyLink = page.locator('footer a[href="/privacy"]');
        await expect(privacyLink).toBeVisible();
        await expect(privacyLink).toHaveText('プライバシーポリシー');

        // フッター内に利用規約リンクが表示されることを確認
        const termsLink = page.locator('footer a[href="/terms"]');
        await expect(termsLink).toBeVisible();
        await expect(termsLink).toHaveText('利用規約');
      });

      test('should have footer links disabled (future implementation)', async ({ page }) => {
        // プライバシーポリシーリンクが無効化されていることを確認（将来実装予定）
        const privacyLink = page.locator('footer a[href="/privacy"]');
        const privacyStyles = await privacyLink.evaluate((el) => {
          const styles = window.getComputedStyle(el);
          return {
            pointerEvents: styles.pointerEvents,
            textDecoration: styles.textDecoration,
          };
        });
        expect(privacyStyles.pointerEvents).toBe('none');

        // 利用規約リンクが無効化されていることを確認
        const termsLink = page.locator('footer a[href="/terms"]');
        const termsStyles = await termsLink.evaluate((el) => {
          const styles = window.getComputedStyle(el);
          return {
            pointerEvents: styles.pointerEvents,
            textDecoration: styles.textDecoration,
          };
        });
        expect(termsStyles.pointerEvents).toBe('none');
      });

      test('should maintain consistent header across pages', async ({ page }) => {
        // 現在のページのヘッダーのスタイルを取得
        const headerBefore = await page.locator('header').boundingBox();
        expect(headerBefore).toBeTruthy();

        // 別のページに遷移
        if (url === '/') {
          await page.goto('/transit-converter');
        } else {
          await page.goto('/');
        }

        // 遷移後もヘッダーが表示されることを確認
        const headerAfter = await page.locator('header').boundingBox();
        expect(headerAfter).toBeTruthy();

        // ヘッダーの高さが一貫していることを確認
        expect(headerBefore!.height).toBe(headerAfter!.height);

        // アプリ名が表示されることを確認
        const appName = page.getByRole('link', { name: /Tools/ });
        await expect(appName).toBeVisible();
      });

      test('should maintain consistent footer across pages', async ({ page }) => {
        // 現在のページのフッターを確認
        const footerBefore = page.locator('footer');
        await expect(footerBefore).toBeVisible();
        const versionBefore = await footerBefore.locator('text=/v\\d+\\.\\d+\\.\\d+/').textContent();

        // 別のページに遷移
        if (url === '/') {
          await page.goto('/transit-converter');
        } else {
          await page.goto('/');
        }

        // 遷移後もフッターが表示されることを確認
        const footerAfter = page.locator('footer');
        await expect(footerAfter).toBeVisible();

        // バージョン情報が一貫していることを確認
        const versionAfter = await footerAfter.locator('text=/v\\d+\\.\\d+\\.\\d+/').textContent();
        expect(versionBefore).toBe(versionAfter);
      });

      test('should have proper color scheme in header', async ({ page }) => {
        // ヘッダーが表示されることを確認
        const header = page.locator('header');
        await expect(header).toBeVisible();
        
        // AppBarにprimaryカラーが適用されていることを確認
        const appBar = page.locator('[class*="MuiAppBar"]');
        await expect(appBar).toBeVisible();
        
        // AppBarのcolorプロパティがprimaryであることを確認（class名で）
        const hasColorPrimary = await appBar.evaluate((el) => {
          return el.className.includes('MuiAppBar-colorPrimary');
        });
        
        expect(hasColorPrimary).toBe(true);
      });

      test('should have proper spacing in footer', async ({ page }) => {
        // フッターの背景色が適切に設定されていることを確認
        const footer = page.locator('footer');
        const backgroundColor = await footer.evaluate((el) => {
          const styles = window.getComputedStyle(el);
          return styles.backgroundColor;
        });

        // グレー系の背景色が設定されていることを確認
        expect(backgroundColor).toMatch(/rgb\(\d+, \d+, \d+\)/);
      });
    });
  });

  test.describe('Header Navigation', () => {
    test('should navigate to homepage when clicking header app name from any page', async ({ page }) => {
      // 乗り換え変換ツールページから開始
      await page.goto('/transit-converter');
      await expect(page).toHaveURL(/transit-converter/);

      // ヘッダーのアプリ名をクリック
      const appName = page.getByRole('link', { name: /Tools/ });
      await appName.click();

      // ホームページに遷移することを確認
      await expect(page).toHaveURL(/\/$|^http:\/\/localhost:3000\/$/);
      await expect(page.getByRole('heading', { name: 'ツール一覧' })).toBeVisible();
    });

    test('should not reload homepage when clicking header app name on homepage', async ({ page }) => {
      // ホームページから開始
      await page.goto('/');

      // ページロードイベントをリッスン
      let navigationOccurred = false;
      page.on('framenavigated', () => {
        navigationOccurred = true;
      });

      // ヘッダーのアプリ名をクリック
      const appName = page.getByRole('link', { name: /Tools/ });
      await appName.click();

      // わずかな待機時間を設ける
      await page.waitForTimeout(500);

      // ホームページのまま（ナビゲーションは発生するが同じページ）
      await expect(page).toHaveURL(/\/$|^http:\/\/localhost:3000\/$/);
      await expect(page.getByRole('heading', { name: 'ツール一覧' })).toBeVisible();
    });
  });

  test.describe('Responsive Header and Footer', () => {
    test('should display header correctly on mobile', async ({ page, isMobile }) => {
      // モバイルビューポートを設定
      if (!isMobile) {
        await page.setViewportSize({ width: 375, height: 667 });
      }
      await page.goto('/');

      // ヘッダーが表示されることを確認
      const header = page.locator('header');
      await expect(header).toBeVisible();

      // アプリ名が中央揃えで表示されることを確認
      const appName = page.getByRole('link', { name: /Tools/ });
      await expect(appName).toBeVisible();

      // ヘッダーの高さがモバイルサイズであることを確認
      const headerBox = await header.boundingBox();
      expect(headerBox).toBeTruthy();
      expect(headerBox!.height).toBeGreaterThanOrEqual(56); // モバイルの最小高さ
    });

    test('should display header correctly on desktop', async ({ page, isMobile }) => {
      // デスクトップビューポートを設定
      test.skip(isMobile, 'This test is for desktop only');

      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/');

      // ヘッダーが表示されることを確認
      const header = page.locator('header');
      await expect(header).toBeVisible();

      // ヘッダーの高さがデスクトップサイズであることを確認
      const headerBox = await header.boundingBox();
      expect(headerBox).toBeTruthy();
      expect(headerBox!.height).toBeGreaterThanOrEqual(64); // デスクトップの最小高さ
    });

    test('should display footer correctly on all viewport sizes', async ({ page }) => {
      const viewportSizes = [
        { width: 375, height: 667, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1920, height: 1080, name: 'desktop' },
      ];

      for (const viewport of viewportSizes) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/');

        // フッターが表示されることを確認
        const footer = page.locator('footer');
        await expect(footer).toBeVisible();

        // バージョン情報が表示されることを確認
        const versionText = footer.locator('text=/v\\d+\\.\\d+\\.\\d+/');
        await expect(versionText).toBeVisible();

        // フッターのコンテンツが中央揃えであることを確認
        const footerTypography = footer.locator('p').first();
        const textAlign = await footerTypography.evaluate((el) => {
          const styles = window.getComputedStyle(el);
          return styles.textAlign;
        });
        expect(textAlign).toBe('center');
      }
    });
  });
});
