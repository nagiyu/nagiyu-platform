import { test, expect } from '@playwright/test';
import { clearTestData, seedTestVideos } from './helpers/test-data';
import { clickNavigationItem, expectNavigationItemVisible } from './helpers/navigation';

/**
 * `clearTestData`（`DELETE /api/test/videos`）はインメモリDBストア全体を消す
 * グローバル操作。Playwright はデフォルトでファイル間も並列実行する
 * （`fullyParallel: true`）ため、このファイル全体を直列化し、他ファイルおよび
 * 同一ファイル内の他テストとのデータ競合を防ぐ。
 */
test.describe.configure({ mode: 'serial' });

test.describe('Video List Page', () => {
  test.beforeEach(async ({ request }) => {
    // 各テスト前にデータをクリア（API経由）
    await clearTestData(request);
  });

  test('should display video list page when authenticated', async ({ page }) => {
    await page.goto('/mylist');

    // タイトルの確認
    await expect(page.getByRole('heading', { name: '動画管理' })).toBeVisible();

    // 説明文の確認
    await expect(
      page.getByText(/動画の一覧を表示し、お気に入りやスキップの設定ができます/)
    ).toBeVisible();
  });

  test('should display filter controls when authenticated', async ({ page }) => {
    await page.goto('/mylist');

    // お気に入りフィルター
    await expect(page.locator('#favorite-filter')).toBeVisible();

    // スキップフィルター
    await expect(page.locator('#skip-filter')).toBeVisible();

    // タイトル検索フィールド
    await expect(page.getByPlaceholder('動画タイトルで検索')).toBeVisible();
  });

  test('should display empty state when filter result is empty', async ({ page }) => {
    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // ユーザー設定未作成の状態では「お気に入りのみ」で0件になる
    await page.locator('#favorite-filter').selectOption('true');

    // 空の状態メッセージ
    await expect(page.getByText('動画が見つかりませんでした')).toBeVisible();
    await expect(
      page.getByText('フィルター条件を変更するか、動画をインポートしてください')
    ).toBeVisible();
  });

  test('should filter videos by search keyword after clicking search button', async ({
    page,
    request,
  }) => {
    const startId = 40000000;
    await seedTestVideos(request, { count: 3, startId });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    const searchKeyword = `${startId + 1}`;
    await page.getByPlaceholder('動画タイトルで検索').fill(searchKeyword);
    await page.getByRole('button', { name: '検索' }).click();
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/videos') && response.url().includes(`search=${searchKeyword}`)
    );

    const videoTitles = page.locator('[class*="MuiCard"] h3');
    await expect(videoTitles).toHaveCount(1);
    await expect(videoTitles.first()).toContainText(`E2E動画 ${searchKeyword}`);
  });

  test('should display empty state when search result is empty', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    const searchKeyword = 'no-match-keyword';
    await page.getByPlaceholder('動画タイトルで検索').fill(searchKeyword);
    await page.getByRole('button', { name: '検索' }).click();
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/videos') && response.url().includes(`search=${searchKeyword}`)
    );

    await expect(page.getByText('動画が見つかりませんでした')).toBeVisible();
  });

  test('should display video cards when videos exist', async ({ page, request }) => {
    // 決定的なシード API でテストデータを作成する（実ニコニコ動画API には依存しない）
    await seedTestVideos(request, { count: 5, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 動画カードが表示される
    const videoCards = page.locator('[class*="MuiCard"]');
    await expect(videoCards.first()).toBeVisible();

    // サムネイル画像
    await expect(videoCards.first().locator('img')).toBeVisible();

    // タイトル
    await expect(videoCards.first().locator('h3')).toBeVisible();
  });

  test('should toggle favorite on video card', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードのお気に入りボタン
    const favoriteButton = page
      .locator('[class*="MuiCard"]')
      .first()
      .getByRole('button', { name: /お気に入り/ });
    await expect(favoriteButton).toBeVisible();

    // waitForResponse は click より前に登録しないとレースコンディションが発生するため先行登録
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/videos/') &&
        response.url().includes('/settings') &&
        response.request().method() === 'PUT' &&
        response.status() === 200
    );

    // ボタンをクリック
    await favoriteButton.click();
    await responsePromise;
  });

  test('should toggle skip on video card', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードのスキップボタン
    const skipButton = page
      .locator('[class*="MuiCard"]')
      .first()
      .getByRole('button', { name: /スキップ/ });
    await expect(skipButton).toBeVisible();

    // waitForResponse は click より前に登録しないとレースコンディションが発生するため先行登録
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/videos/') &&
        response.url().includes('/settings') &&
        response.request().method() === 'PUT' &&
        response.status() === 200
    );

    // ボタンをクリック
    await skipButton.click();
    await responsePromise;
  });

  test('should filter videos by favorite', async ({ page, request }) => {
    // セットアップは UI クリックではなく test seed API でお気に入り 2 件を直接作成する。
    // クリックで作ると VideoList の再フェッチ・再レンダリングと次のクリックが
    // 競合してフレークになる。
    await seedTestVideos(request, { count: 5, startId: 40000000, favoriteCount: 2 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // お気に入りフィルターを変更
    await page.locator('#favorite-filter').selectOption('true');

    // APIレスポンスを待つ
    const filterResponse = await page.waitForResponse((res) => res.url().includes('/api/videos'));
    const filterBody = await filterResponse.json();

    // お気に入りのみがフィルターされていることを確認
    expect(filterBody.total).toBe(2); // 2個のお気に入りのみ
    expect(filterBody.videos.length).toBe(2);
  });

  test('should filter videos by skip', async ({ page, request }) => {
    await seedTestVideos(request, { count: 5, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // スキップフィルターを変更
    await page.locator('#skip-filter').selectOption('false');

    // APIレスポンスを待つ
    await page.waitForResponse((response) => response.url().includes('/api/videos'));
  });

  test('should display pagination when many videos', async ({ page, request }) => {
    // 30個の動画をシード（ページネーション表示に必要）
    await seedTestVideos(request, { count: 30, startId: 40000000 });

    await page.goto('/mylist');

    // ページネーションが表示される
    await expect(page.getByRole('navigation')).toBeVisible();

    // ページ情報（例: 100件中 1-20件を表示）
    await expect(page.getByText(/件中.*件を表示/)).toBeVisible();
  });

  test('should navigate to next page', async ({ page, request }) => {
    await seedTestVideos(request, { count: 30, startId: 40000000 });

    await page.goto('/mylist');

    // 次のページボタンをクリック
    const nextButton = page.getByRole('button', { name: 'Go to next page' });
    await nextButton.click();

    // APIレスポンスを待つ
    await page.waitForResponse((response) => response.url().includes('/api/videos'));
  });

  test('should navigate to last page', async ({ page, request }) => {
    await seedTestVideos(request, { count: 30, startId: 40000000 });

    await page.goto('/mylist');

    // 最後のページボタンをクリック
    const lastButton = page.getByRole('button', { name: 'Go to last page' });
    await lastButton.click();

    // APIレスポンスを待つ
    await page.waitForResponse((response) => response.url().includes('/api/videos'));
  });

  test('should display loading state', async ({ page }) => {
    // 動画一覧 API のレスポンスを意図的に遅延させ、ローディング表示を決定的に観測する
    await page.route(
      (url) => url.pathname === '/api/videos',
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      }
    );

    await page.goto('/mylist');

    // ローディング表示
    await expect(page.getByRole('progressbar')).toBeVisible();
  });

  test('should display error message on API failure', async ({ page }) => {
    // 動画一覧 API を 500 で失敗させ、エラー表示を決定的に検証する
    await page.route(
      (url) => url.pathname === '/api/videos',
      async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      }
    );

    await page.goto('/mylist');

    // エラーメッセージの確認
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Video List Navigation', () => {
  test.beforeEach(async ({ request }) => {
    // 各テスト前にデータをクリア（API経由）
    await clearTestData(request);
  });

  test('should have navigation links', async ({ page }) => {
    await page.goto('/mylist');

    // ナビゲーションリンクの確認（モバイルでは Drawer、デスクトップでは Toolbar を自動切替）
    await expectNavigationItemVisible(page, 'ホーム');
    await expectNavigationItemVisible(page, 'インポート');
    await expectNavigationItemVisible(page, '動画一覧');
  });

  test('should navigate to home when clicking home button', async ({ page }) => {
    await page.goto('/mylist');

    await clickNavigationItem(page, 'ホーム');

    // ホームページに遷移
    await expect(page).toHaveURL('/');
  });

  test('should navigate to import when clicking import button', async ({ page }) => {
    await page.goto('/mylist');

    await clickNavigationItem(page, 'インポート');

    // インポートページに遷移
    await expect(page).toHaveURL('/import');
  });
});

test.describe('Video List URL Synchronization', () => {
  test.beforeEach(async ({ request }) => {
    // 各テスト前にデータをクリア（API経由）
    await clearTestData(request);
  });

  test('should initialize filters from URL parameters', async ({ page, request }) => {
    // お気に入り25件を含む30件をシードし、favorite=true & offset=20 の URL で
    // フィルターSelectの値とページネーション（offset）の両方が初期化されることを検証する
    await seedTestVideos(request, { count: 30, startId: 40000000, favoriteCount: 25 });

    await page.goto('/mylist?favorite=true&offset=20');
    await page.waitForLoadState('networkidle');

    // フィルターSelectの値がURLパラメータから初期化されている
    await expect(page.locator('#favorite-filter')).toHaveValue('true');

    // お気に入り25件のうち21-25件目（5件）を表示している = offset が初期化されている
    await expect(page.getByText('25 件中 21 - 25 件を表示')).toBeVisible();
  });

  test('should update URL when changing favorite filter', async ({ page, request }) => {
    await seedTestVideos(request, { count: 5, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // お気に入りフィルターを変更
    await page.locator('#favorite-filter').selectOption('true');

    // URLが更新されることを確認
    await expect(page).toHaveURL('/mylist?favorite=true');
  });

  test('should update URL when changing skip filter', async ({ page, request }) => {
    await seedTestVideos(request, { count: 5, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // スキップフィルターを変更
    await page.locator('#skip-filter').selectOption('false');

    // URLが更新されることを確認
    await expect(page).toHaveURL('/mylist?skip=false');
  });

  test('should update URL when changing search keyword', async ({ page }) => {
    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('動画タイトルで検索').fill('test');
    await page.getByRole('button', { name: '検索' }).click();

    await page.waitForResponse(
      (response) => response.url().includes('/api/videos') && response.url().includes('search=test')
    );
    await expect(page).toHaveURL('/mylist?search=test');
  });

  test('should update URL when changing both filters', async ({ page, request }) => {
    await seedTestVideos(request, { count: 5, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // お気に入りフィルターを変更
    await page.locator('#favorite-filter').selectOption('true');
    // フィルター変更ハンドラは現在の URL から他フィルター値を読み直すため、
    // 1 回目の router.push がコミットされるのを待たないと 2 回目の変更で値が落ちる
    await expect(page).toHaveURL('/mylist?favorite=true');

    // スキップフィルターを変更
    await page.locator('#skip-filter').selectOption('false');

    // URLが更新されることを確認
    await expect(page).toHaveURL('/mylist?favorite=true&skip=false');
  });

  test('should update URL when changing page', async ({ page, request }) => {
    await seedTestVideos(request, { count: 30, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 次のページに移動
    const nextButton = page.getByRole('button', { name: 'Go to next page' });
    await nextButton.click();

    // URLにoffsetが追加されることを確認
    await expect(page).toHaveURL(/\/mylist\?.*offset=20/);
  });

  test('should maintain filters when navigating pages', async ({ page, request }) => {
    await seedTestVideos(request, { count: 30, startId: 40000000, favoriteCount: 30 });

    await page.goto('/mylist?favorite=true');

    // APIレスポンスを待つ
    await page.waitForLoadState('networkidle');

    // 次のページに移動
    const nextButton = page.getByRole('button', { name: 'Go to next page' });
    await nextButton.click();

    // フィルターとoffsetの両方がURLに含まれることを確認
    await expect(page).toHaveURL(/\/mylist\?.*favorite=true.*offset=20/);
  });

  test('should reset page when changing filters', async ({ page, request }) => {
    await seedTestVideos(request, { count: 30, startId: 40000000 });

    // 2ページ目に移動
    await page.goto('/mylist?offset=20');
    await page.waitForLoadState('networkidle');

    // フィルターを変更
    await page.locator('#favorite-filter').selectOption('true');

    // offsetがリセットされることを確認
    await expect(page).toHaveURL('/mylist?favorite=true');
  });

  test('should reset page when changing search keyword', async ({ page }) => {
    await page.goto('/mylist?offset=20');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('動画タイトルで検索').fill('keyword');
    await page.getByRole('button', { name: '検索' }).click();

    await expect(page).toHaveURL('/mylist?search=keyword');
  });

  test('should maintain state on browser back', async ({ page, request }) => {
    await seedTestVideos(request, { count: 5, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // フィルターを変更
    await page.locator('#favorite-filter').selectOption('true');

    // URLが更新されることを確認
    await expect(page).toHaveURL('/mylist?favorite=true');

    // ブラウザバック
    await page.goBack();

    // 元の状態に戻ることを確認
    await expect(page).toHaveURL('/mylist');
  });

  test('should maintain state on browser forward', async ({ page, request }) => {
    await seedTestVideos(request, { count: 5, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // フィルターを変更
    await page.locator('#favorite-filter').selectOption('true');

    await expect(page).toHaveURL('/mylist?favorite=true');

    // ブラウザバック
    await page.goBack();
    await expect(page).toHaveURL('/mylist');

    // ブラウザフォワード
    await page.goForward();
    await expect(page).toHaveURL('/mylist?favorite=true');
  });

  test('should restore search state on browser back and forward', async ({ page, request }) => {
    const startId = 40000000;
    await seedTestVideos(request, { count: 3, startId });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    const searchKeyword = `${startId + 1}`;
    const searchField = page.getByPlaceholder('動画タイトルで検索');
    await searchField.fill(searchKeyword);
    await page.getByRole('button', { name: '検索' }).click();
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/videos') && response.url().includes(`search=${searchKeyword}`)
    );
    await expect(page).toHaveURL(`/mylist?search=${searchKeyword}`);

    await page.goBack();
    await expect(page).toHaveURL('/mylist');
    await expect(searchField).toHaveValue('');

    await page.goForward();
    await expect(page).toHaveURL(`/mylist?search=${searchKeyword}`);
    await expect(searchField).toHaveValue(searchKeyword);
  });

  test('should apply search and favorite filters as AND condition', async ({ page, request }) => {
    const startId = 40000000;
    await seedTestVideos(request, { count: 3, startId, favoriteCount: 1 });

    await page.goto(`/mylist?favorite=true&search=${startId + 1}`);
    await expect(page.getByText('動画が見つかりませんでした')).toBeVisible();

    await page.goto(`/mylist?favorite=true&search=${startId}`);
    const videoTitles = page.locator('[class*="MuiCard"] h3');
    await expect(videoTitles).toHaveCount(1);
    await expect(videoTitles.first()).toContainText(`E2E動画 ${startId}`);
  });

  test('should handle direct URL access with filters', async ({ page, request }) => {
    await seedTestVideos(request, { count: 10, startId: 40000000 });

    // フィルター付きURLに直接アクセス
    await page.goto('/mylist?favorite=true&skip=false');
    await page.waitForLoadState('networkidle');

    // URL パラメータと Select 要素の value の両方が反映されることを確認
    await expect(page).toHaveURL(/favorite=true/);
    await expect(page).toHaveURL(/skip=false/);
    await expect(page.locator('#favorite-filter')).toHaveValue('true');
    await expect(page.locator('#skip-filter')).toHaveValue('false');
  });
});
