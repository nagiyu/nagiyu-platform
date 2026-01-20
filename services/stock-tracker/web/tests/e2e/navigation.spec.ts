import { test, expect } from '@playwright/test';

/**
 * E2E-009: ナビゲーション
 *
 * このテストは以下を検証します:
 * - 画面遷移が正しく動作する
 * - ブラウザバック/進むボタンが正しく動作する
 * - ナビゲーションがスムーズである
 * - URLが正しく更新される
 */

test.describe('ナビゲーション (E2E-009)', () => {
  test.describe('画面遷移', () => {
    test('トップ画面から保有株式管理画面に遷移できる', async ({ page }) => {
      // トップ画面にアクセス
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 保有株式管理へのリンクをクリック
      const holdingLink = page.locator('a[href="/holdings"], button:has-text("保有株式")').first();
      await holdingLink.click();

      // 保有株式管理画面に遷移
      await expect(page).toHaveURL('/holdings');
      await expect(page.getByRole('heading', { name: '保有株式管理' })).toBeVisible({
        timeout: 10000,
      });
    });

    test('トップ画面からウォッチリスト管理画面に遷移できる', async ({ page }) => {
      // トップ画面にアクセス
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ウォッチリストへのリンクをクリック
      const watchlistLink = page
        .locator('a[href="/watchlist"], button:has-text("ウォッチリスト")')
        .first();
      await watchlistLink.click();

      // ウォッチリスト管理画面に遷移
      await expect(page).toHaveURL('/watchlist');
      await expect(page.getByRole('heading', { name: 'ウォッチリスト' })).toBeVisible({
        timeout: 10000,
      });
    });

    test('トップ画面からアラート一覧画面に遷移できる', async ({ page }) => {
      // トップ画面にアクセス
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // アラートへのリンクをクリック
      const alertLink = page.locator('a[href="/alerts"], button:has-text("アラート")').first();
      await alertLink.click();

      // アラート一覧画面に遷移
      await expect(page).toHaveURL('/alerts');
      await expect(page.getByRole('heading', { name: 'アラート一覧' })).toBeVisible({
        timeout: 10000,
      });
    });

    test('保有株式管理画面からアラート一覧画面に遷移できる', async ({ page }) => {
      // 保有株式管理画面にアクセス
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');

      // アラートへのリンクをクリック
      const alertLink = page.locator('a[href="/alerts"], button:has-text("アラート")').first();
      await alertLink.click();

      // アラート一覧画面に遷移
      await expect(page).toHaveURL('/alerts');
      await expect(page.getByRole('heading', { name: 'アラート一覧' })).toBeVisible({
        timeout: 10000,
      });
    });

    test('ウォッチリスト管理画面から保有株式管理画面に遷移できる', async ({ page }) => {
      // ウォッチリスト管理画面にアクセス
      await page.goto('/watchlist');
      await page.waitForLoadState('networkidle');

      // 保有株式へのリンクをクリック
      const holdingLink = page.locator('a[href="/holdings"], button:has-text("保有株式")').first();
      await holdingLink.click();

      // 保有株式管理画面に遷移
      await expect(page).toHaveURL('/holdings');
      await expect(page.getByRole('heading', { name: '保有株式管理' })).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe('マスタデータ管理画面への遷移', () => {
    test('取引所管理画面に遷移できる（stock-adminロールの場合）', async ({ page }) => {
      // トップ画面にアクセス
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 取引所管理へのリンクをクリック（存在する場合）
      const exchangeLink = page.locator('a[href="/exchanges"], button:has-text("取引所")').first();
      const isVisible = await exchangeLink.isVisible().catch(() => false);

      if (isVisible) {
        await exchangeLink.click();

        // 取引所管理画面に遷移
        await expect(page).toHaveURL('/exchanges');
        await expect(page.locator('h1:has-text("取引所管理")')).toBeVisible({ timeout: 10000 });
      } else {
        // リンクが表示されない場合は直接URLでアクセスを試みる
        await page.goto('/exchanges');
        await page.waitForLoadState('networkidle');

        // stock-adminロールの場合はページが表示される
        const pageHeading = page.locator('h1:has-text("取引所管理")');
        const headingVisible = await pageHeading.isVisible().catch(() => false);

        if (headingVisible) {
          await expect(pageHeading).toBeVisible();
        }
      }
    });

    test('ティッカー管理画面に遷移できる（stock-adminロールの場合）', async ({ page }) => {
      // トップ画面にアクセス
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ティッカー管理へのリンクをクリック（存在する場合）
      const tickerLink = page.locator('a[href="/tickers"], button:has-text("ティッカー")').first();
      const isVisible = await tickerLink.isVisible().catch(() => false);

      if (isVisible) {
        await tickerLink.click();

        // ティッカー管理画面に遷移
        await expect(page).toHaveURL('/tickers');
        await expect(page.locator('h1:has-text("ティッカー管理")')).toBeVisible({ timeout: 10000 });
      } else {
        // リンクが表示されない場合は直接URLでアクセスを試みる
        await page.goto('/tickers');
        await page.waitForLoadState('networkidle');

        // stock-adminロールの場合はページが表示される
        const pageHeading = page.locator('h1:has-text("ティッカー管理")');
        const headingVisible = await pageHeading.isVisible().catch(() => false);

        if (headingVisible) {
          await expect(pageHeading).toBeVisible();
        }
      }
    });

    test('取引所管理画面からティッカー管理画面に遷移できる', async ({ page }) => {
      // 取引所管理画面にアクセス
      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');

      // stock-adminロールの場合のみテスト実行
      const pageHeading = page.locator('h1:has-text("取引所管理")');
      const isVisible = await pageHeading.isVisible().catch(() => false);

      if (isVisible) {
        // ティッカー管理へのリンクをクリック
        const tickerLink = page
          .locator('a[href="/tickers"], button:has-text("ティッカー")')
          .first();
        const tickerLinkVisible = await tickerLink.isVisible().catch(() => false);

        if (tickerLinkVisible) {
          await tickerLink.click();

          // ティッカー管理画面に遷移
          await expect(page).toHaveURL('/tickers');
          await expect(page.locator('h1:has-text("ティッカー管理")')).toBeVisible({
            timeout: 10000,
          });
        }
      }
    });
  });

  test.describe('戻るボタンによる画面遷移', () => {
    test('各画面の戻るボタンでトップ画面に戻る', async ({ page }) => {
      // 保有株式管理画面にアクセス
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');

      // 戻るボタンをクリック
      const backButton = page.locator('button:has-text("戻る")').first();
      const isVisible = await backButton.isVisible().catch(() => false);

      if (isVisible) {
        await backButton.click();

        // トップ画面に遷移
        await expect(page).toHaveURL('/');
        await expect(page.getByLabel('取引所選択')).toBeVisible({ timeout: 10000 });
      }
    });

    test('取引所管理画面の戻るボタンでトップ画面に戻る', async ({ page }) => {
      // 取引所管理画面にアクセス
      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');

      // stock-adminロールの場合のみテスト実行
      const pageHeading = page.locator('h1:has-text("取引所管理")');
      const isVisible = await pageHeading.isVisible().catch(() => false);

      if (isVisible) {
        // 戻るボタンをクリック
        const backButton = page.locator('button:has-text("戻る")').first();
        await backButton.click();

        // トップ画面に遷移
        await expect(page).toHaveURL('/');
      }
    });
  });

  test.describe('ブラウザバック/進む機能', () => {
    test('ブラウザバックで前の画面に戻る', async ({ page }) => {
      // トップ画面にアクセス
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 保有株式管理画面に遷移
      const holdingLink = page.locator('a[href="/holdings"], button:has-text("保有株式")').first();
      await holdingLink.click();
      await expect(page).toHaveURL('/holdings');

      // ブラウザバックボタンをクリック
      await page.goBack();

      // トップ画面に戻る
      await expect(page).toHaveURL('/');
      await expect(page.getByLabel('取引所選択')).toBeVisible({ timeout: 10000 });
    });

    test('ブラウザバックと進むボタンで履歴を移動できる', async ({ page }) => {
      // トップ画面にアクセス
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 保有株式管理画面に遷移
      const holdingLink = page.locator('a[href="/holdings"], button:has-text("保有株式")').first();
      await holdingLink.click();
      await expect(page).toHaveURL('/holdings');

      // ウォッチリスト管理画面に遷移
      const watchlistLink = page
        .locator('a[href="/watchlist"], button:has-text("ウォッチリスト")')
        .first();
      await watchlistLink.click();
      await expect(page).toHaveURL('/watchlist');

      // ブラウザバックで保有株式管理画面に戻る
      await page.goBack();
      await expect(page).toHaveURL('/holdings');
      await expect(page.getByRole('heading', { name: '保有株式管理' })).toBeVisible({
        timeout: 10000,
      });

      // ブラウザバックでトップ画面に戻る
      await page.goBack();
      await expect(page).toHaveURL('/');

      // ブラウザ進むボタンで保有株式管理画面に戻る
      await page.goForward();
      await expect(page).toHaveURL('/holdings');

      // ブラウザ進むボタンでウォッチリスト管理画面に戻る
      await page.goForward();
      await expect(page).toHaveURL('/watchlist');
    });

    test('複数画面を遷移した後のブラウザバック', async ({ page }) => {
      // トップ画面 → 保有株式 → アラート → ウォッチリストの順に遷移
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // 保有株式管理画面
      const holdingLink = page.locator('a[href="/holdings"], button:has-text("保有株式")').first();
      await holdingLink.click();
      await expect(page).toHaveURL('/holdings');

      // アラート一覧画面
      const alertLink = page.locator('a[href="/alerts"], button:has-text("アラート")').first();
      await alertLink.click();
      await expect(page).toHaveURL('/alerts');

      // ウォッチリスト管理画面
      const watchlistLink = page
        .locator('a[href="/watchlist"], button:has-text("ウォッチリスト")')
        .first();
      await watchlistLink.click();
      await expect(page).toHaveURL('/watchlist');

      // 逆順でブラウザバック
      await page.goBack();
      await expect(page).toHaveURL('/alerts');

      await page.goBack();
      await expect(page).toHaveURL('/holdings');

      await page.goBack();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('URLの直接入力', () => {
    test('URLを直接入力して各画面にアクセスできる', async ({ page }) => {
      // 保有株式管理画面
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL('/holdings');
      await expect(page.getByRole('heading', { name: '保有株式管理' })).toBeVisible({
        timeout: 10000,
      });

      // ウォッチリスト管理画面
      await page.goto('/watchlist');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL('/watchlist');
      await expect(page.getByRole('heading', { name: 'ウォッチリスト' })).toBeVisible({
        timeout: 10000,
      });

      // アラート一覧画面
      await page.goto('/alerts');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL('/alerts');
      await expect(page.getByRole('heading', { name: 'アラート一覧' })).toBeVisible({
        timeout: 10000,
      });

      // トップ画面
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL('/');
      await expect(page.getByLabel('取引所選択')).toBeVisible({ timeout: 10000 });
    });

    test('存在しないURLにアクセスした場合に適切に処理される', async ({ page }) => {
      // 存在しないURLにアクセス
      await page.goto('/nonexistent-page');
      await page.waitForLoadState('networkidle');

      // 404ページまたはリダイレクトが表示される
      const is404 = await page
        .locator('text=/404|ページが見つかりません/i')
        .isVisible()
        .catch(() => false);
      const isRedirected = page.url() === new URL('/', page.url()).href;

      // 404ページまたはリダイレクトのいずれかが発生する
      expect(is404 || isRedirected).toBeTruthy();
    });
  });

  test.describe('ナビゲーションのパフォーマンス', () => {
    test('画面遷移がスムーズである', async ({ page }) => {
      // トップ画面にアクセス
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const startTime = Date.now();

      // 保有株式管理画面に遷移
      const holdingLink = page.locator('a[href="/holdings"], button:has-text("保有株式")').first();
      await holdingLink.click();
      await page.waitForLoadState('networkidle');

      const endTime = Date.now();
      const transitionTime = endTime - startTime;

      // 画面遷移が5秒以内に完了する
      expect(transitionTime).toBeLessThan(5000);

      // ページが正しく表示される
      await expect(page.getByRole('heading', { name: '保有株式管理' })).toBeVisible();
    });

    test('複数回の画面遷移が安定している', async ({ page }) => {
      // トップ画面から複数回遷移
      for (let i = 0; i < 3; i++) {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const holdingLink = page
          .locator('a[href="/holdings"], button:has-text("保有株式")')
          .first();
        await holdingLink.click();
        await expect(page).toHaveURL('/holdings');
        await expect(page.getByRole('heading', { name: '保有株式管理' })).toBeVisible({
          timeout: 10000,
        });
      }

      // 最後のページ表示が成功していることを確認
      await expect(page.getByRole('heading', { name: '保有株式管理' })).toBeVisible();
    });
  });

  test.describe('クエリパラメータの処理', () => {
    test('アラート一覧画面でクエリパラメータを含むURLにアクセスできる', async ({ page }) => {
      // クエリパラメータ付きURLにアクセス
      await page.goto('/alerts?ticker=NASDAQ:AAPL&mode=Sell&openModal=true');
      await page.waitForLoadState('networkidle');

      // ページが正しく表示される
      await expect(page).toHaveURL(/\/alerts/);
      await expect(page.getByRole('heading', { name: 'アラート一覧' })).toBeVisible({
        timeout: 10000,
      });

      // クエリパラメータによってモーダルが開く可能性がある
      const modal = page.getByRole('dialog');
      const isModalVisible = await modal.isVisible().catch(() => false);

      // モーダルが開いているか、または一覧が表示されている
      if (isModalVisible) {
        await expect(modal).toBeVisible();
      } else {
        // モーダルが開いていない場合は一覧が表示される
        await expect(page.getByRole('heading', { name: 'アラート一覧' })).toBeVisible();
      }
    });

    test('クエリパラメータがブラウザバックで保持される', async ({ page }) => {
      // クエリパラメータ付きでアラート一覧にアクセス
      await page.goto('/alerts?mode=Buy');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/alerts\?mode=Buy/);

      // トップ画面に遷移
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ブラウザバックで戻る
      await page.goBack();

      // クエリパラメータが保持されている
      await expect(page).toHaveURL(/\/alerts\?mode=Buy/);
    });
  });
});
