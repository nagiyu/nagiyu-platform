import { test, expect } from '@playwright/test';
import { clearTestData, seedVideoData } from './helpers/test-data';

test.describe('Video List Page', () => {
  test.beforeEach(async () => {
    // 各テスト前にデータをクリア
    await clearTestData();
  });

  test.skip('should redirect to home when not authenticated', async ({ page }) => {
    // このテストはSKIP_AUTH_CHECK=trueの環境では実行できない
    // E2Eテスト環境では常に認証がバイパスされるため、未認証状態をテストできない
    // 未認証時のリダイレクト動作は middleware のユニットテストで検証する
    await page.goto('/mylist');

    // 認証されていない場合はホームにリダイレクト
    await expect(page).toHaveURL('/');
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
    await expect(page.getByRole('combobox', { name: 'お気に入り' })).toBeVisible();

    // スキップフィルター
    await expect(page.getByRole('combobox', { name: 'スキップ' })).toBeVisible();
  });

  test('should display empty state when no videos', async ({ page }) => {
    await page.goto('/mylist');

    // 空の状態メッセージ
    await expect(page.getByText('動画が見つかりませんでした')).toBeVisible();
    await expect(
      page.getByText('フィルター条件を変更するか、動画をインポートしてください')
    ).toBeVisible();
  });

  test('should display video cards when videos exist', async ({ page }) => {
    // テストデータを作成
    await seedVideoData('test-user-id', 5);

    await page.goto('/mylist');

    // 動画カードが表示される
    const videoCards = page.locator('[class*="MuiCard"]');
    await expect(videoCards.first()).toBeVisible();

    // サムネイル画像
    await expect(videoCards.first().locator('img')).toBeVisible();

    // タイトル
    await expect(videoCards.first().locator('h3')).toBeVisible();
  });

  test('should toggle favorite on video card', async ({ page }) => {
    // テストデータを作成
    await seedVideoData('test-user-id', 3);

    await page.goto('/mylist');

    // 最初の動画カードのお気に入りボタン
    const favoriteButton = page
      .locator('[class*="MuiCard"]')
      .first()
      .getByRole('button', { name: /お気に入り/ });
    await expect(favoriteButton).toBeVisible();

    // ボタンをクリック
    await favoriteButton.click();

    // レスポンスを待つ（適切なAPI呼び出しが行われることを確認）
    await page.waitForResponse((response) => response.url().includes('/api/videos/'));
  });

  test('should toggle skip on video card', async ({ page }) => {
    // テストデータを作成
    await seedVideoData('test-user-id', 3);

    await page.goto('/mylist');

    // 最初の動画カードのスキップボタン
    const skipButton = page
      .locator('[class*="MuiCard"]')
      .first()
      .getByRole('button', { name: /スキップ/ });
    await expect(skipButton).toBeVisible();

    // ボタンをクリック
    await skipButton.click();

    // レスポンスを待つ
    await page.waitForResponse((response) => response.url().includes('/api/videos/'));
  });

  test('should filter videos by favorite', async ({ page }) => {
    // テストデータを作成（5個中2個をお気に入りに）
    await seedVideoData('test-user-id', 5, { favoriteCount: 2 });

    await page.goto('/mylist');

    // お気に入りフィルターを変更
    const favoriteFilter = page.getByRole('combobox', { name: 'お気に入り' });
    await favoriteFilter.click();
    await page.getByRole('option', { name: 'お気に入りのみ' }).click();

    // APIレスポンスを待つ
    const response = await page.waitForResponse((res) => res.url().includes('/api/videos'));
    const body = await response.json();
    
    // お気に入りのみがフィルターされていることを確認
    expect(body.total).toBe(2); // 5個中2個がお気に入り
    expect(body.videos).toHaveLength(2);
  });

  test('should filter videos by skip', async ({ page }) => {
    // テストデータを作成（5個中1個をスキップに）
    await seedVideoData('test-user-id', 5, { skipCount: 1 });

    await page.goto('/mylist');

    // スキップフィルターを変更
    const skipFilter = page.getByRole('combobox', { name: 'スキップ' });
    await skipFilter.click();
    await page.getByRole('option', { name: '通常動画のみ' }).click();

    // APIレスポンスを待つ
    await page.waitForResponse((response) => response.url().includes('/api/videos'));
  });

  test('should display pagination when many videos', async ({ page }) => {
    // テストデータを作成（21個以上）
    await seedVideoData('test-user-id', 25);

    await page.goto('/mylist');

    // ページネーションが表示される
    await expect(page.getByRole('navigation')).toBeVisible();

    // ページ情報（例: 100件中 1-20件を表示）
    await expect(page.getByText(/件中.*件を表示/)).toBeVisible();
  });

  test('should navigate to next page', async ({ page }) => {
    // テストデータを作成（21個以上）
    await seedVideoData('test-user-id', 25);

    await page.goto('/mylist');

    // 次のページボタンをクリック
    const nextButton = page.getByRole('button', { name: 'Go to next page' });
    await nextButton.click();

    // APIレスポンスを待つ
    await page.waitForResponse((response) => response.url().includes('/api/videos'));
  });

  test('should navigate to last page', async ({ page }) => {
    // テストデータを作成（21個以上）
    await seedVideoData('test-user-id', 25);

    await page.goto('/mylist');

    // 最後のページボタンをクリック
    const lastButton = page.getByRole('button', { name: 'Go to last page' });
    await lastButton.click();

    // APIレスポンスを待つ
    await page.waitForResponse((response) => response.url().includes('/api/videos'));
  });

  test.skip('should display loading state', async ({ page }) => {
    // TODO: Implement authentication setup and slow network simulation

    await page.goto('/mylist');

    // ローディング表示
    await expect(page.getByRole('progressbar')).toBeVisible();
  });

  test.skip('should display error message on API failure', async ({ page }) => {
    // TODO: Implement authentication setup and mock API failure

    await page.goto('/mylist');

    // エラーメッセージの確認
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Video List Navigation', () => {
  test.beforeEach(async () => {
    // 各テスト前にデータをクリア
    await clearTestData();
  });

  test('should have navigation links', async ({ page }) => {
    await page.goto('/mylist');

    // ナビゲーションリンクの確認（AppBar内のボタンに限定）
    const toolbar = page.locator('header[class*="MuiAppBar"] [class*="MuiToolbar"]');
    await expect(toolbar.getByRole('button', { name: 'ホーム' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'インポート' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: '動画一覧' })).toBeVisible();
  });

  test('should navigate to home when clicking home button', async ({ page }) => {
    await page.goto('/mylist');

    const toolbar = page.locator('header[class*="MuiAppBar"] [class*="MuiToolbar"]');
    const homeButton = toolbar.getByRole('button', { name: 'ホーム' });
    await homeButton.click();

    // ホームページに遷移
    await expect(page).toHaveURL('/');
  });

  test('should navigate to import when clicking import button', async ({ page }) => {
    await page.goto('/mylist');

    const toolbar = page.locator('header[class*="MuiAppBar"] [class*="MuiToolbar"]');
    const importButton = toolbar.getByRole('button', { name: 'インポート' });
    await importButton.click();

    // インポートページに遷移
    await expect(page).toHaveURL('/import');
  });
});

test.describe('Video List URL Synchronization', () => {
  test.beforeEach(async () => {
    // 各テスト前にデータをクリア
    await clearTestData();
  });

  test.skip('should initialize filters from URL parameters', async ({ page }) => {
    // このテストはSKIP_AUTH_CHECK=trueの環境では実行できない
    // E2Eテスト環境では常に認証がバイパスされるため、未認証状態でのリダイレクト動作をテストできない
    // 未認証時のリダイレクト動作は middleware のユニットテストで検証する
    // URLパラメータ付きでアクセス
    await page.goto('/mylist?favorite=true&skip=false&offset=20');

    // URLパラメータが反映されることを期待（認証なしでもURLは処理される）
    // 認証されていない場合はホームにリダイレクトされるが、この動作は正常
    await expect(page).toHaveURL('/');
  });

  test('should update URL when changing favorite filter', async ({ page }) => {
    // テストデータを作成
    await seedVideoData('test-user-id', 5, { favoriteCount: 2 });

    await page.goto('/mylist');

    // お気に入りフィルターを変更
    const favoriteFilter = page.getByRole('combobox', { name: 'お気に入り' });
    await favoriteFilter.click();
    await page.getByRole('option', { name: 'お気に入りのみ' }).click();

    // URLが更新されることを確認
    await expect(page).toHaveURL('/mylist?favorite=true');
  });

  test('should update URL when changing skip filter', async ({ page }) => {
    // テストデータを作成
    await seedVideoData('test-user-id', 5);

    await page.goto('/mylist');

    // スキップフィルターを変更
    const skipFilter = page.getByRole('combobox', { name: 'スキップ' });
    await skipFilter.click();
    await page.getByRole('option', { name: '通常動画のみ' }).click();

    // URLが更新されることを確認
    await expect(page).toHaveURL('/mylist?skip=false');
  });

  test('should update URL when changing both filters', async ({ page }) => {
    // テストデータを作成
    await seedVideoData('test-user-id', 5, { favoriteCount: 2 });

    await page.goto('/mylist');

    // お気に入りフィルターを変更
    const favoriteFilter = page.getByRole('combobox', { name: 'お気に入り' });
    await favoriteFilter.click();
    await page.getByRole('option', { name: 'お気に入りのみ' }).click();

    // スキップフィルターを変更
    const skipFilter = page.getByRole('combobox', { name: 'スキップ' });
    await skipFilter.click();
    await page.getByRole('option', { name: '通常動画のみ' }).click();

    // URLが更新されることを確認
    await expect(page).toHaveURL('/mylist?favorite=true&skip=false');
  });

  test('should update URL when changing page', async ({ page }) => {
    // テストデータを作成（21個以上）
    await seedVideoData('test-user-id', 25);

    await page.goto('/mylist');

    // 次のページに移動
    const nextButton = page.getByRole('button', { name: 'Go to next page' });
    await nextButton.click();

    // URLにoffsetが追加されることを確認
    await expect(page).toHaveURL(/\/mylist\?.*offset=20/);
  });

  test('should maintain filters when navigating pages', async ({ page }) => {
    // テストデータを作成（21個以上、お気に入りを含む）
    await seedVideoData('test-user-id', 25, { favoriteCount: 15 });

    await page.goto('/mylist?favorite=true');

    // APIレスポンスを待つ
    await page.waitForLoadState('networkidle');

    // 次のページに移動
    const nextButton = page.getByRole('button', { name: 'Go to next page' });
    await nextButton.click();

    // フィルターとoffsetの両方がURLに含まれることを確認
    await expect(page).toHaveURL(/\/mylist\?.*favorite=true.*offset=20/);
  });

  test('should reset page when changing filters', async ({ page }) => {
    // テストデータを作成（21個以上）
    await seedVideoData('test-user-id', 25, { favoriteCount: 15 });

    // 2ページ目に移動
    await page.goto('/mylist?offset=20');
    await page.waitForLoadState('networkidle');

    // フィルターを変更
    const favoriteFilter = page.getByRole('combobox', { name: 'お気に入り' });
    await favoriteFilter.click();
    await page.getByRole('option', { name: 'お気に入りのみ' }).click();

    // offsetがリセットされることを確認
    await expect(page).toHaveURL('/mylist?favorite=true');
  });

  test('should maintain state on browser back', async ({ page }) => {
    // テストデータを作成
    await seedVideoData('test-user-id', 5, { favoriteCount: 2 });

    await page.goto('/mylist');

    // フィルターを変更
    const favoriteFilter = page.getByRole('combobox', { name: 'お気に入り' });
    await favoriteFilter.click();
    await page.getByRole('option', { name: 'お気に入りのみ' }).click();

    // URLが更新されることを確認
    await expect(page).toHaveURL('/mylist?favorite=true');

    // ブラウザバック
    await page.goBack();

    // 元の状態に戻ることを確認
    await expect(page).toHaveURL('/mylist');

    // フィルターの状態も戻っていることを確認
    await expect(favoriteFilter).toHaveValue('all');
  });

  test('should maintain state on browser forward', async ({ page }) => {
    // テストデータを作成
    await seedVideoData('test-user-id', 5, { favoriteCount: 2 });

    await page.goto('/mylist');

    // フィルターを変更
    const favoriteFilter = page.getByRole('combobox', { name: 'お気に入り' });
    await favoriteFilter.click();
    await page.getByRole('option', { name: 'お気に入りのみ' }).click();

    await expect(page).toHaveURL('/mylist?favorite=true');

    // ブラウザバック
    await page.goBack();
    await expect(page).toHaveURL('/mylist');

    // ブラウザフォワード
    await page.goForward();
    await expect(page).toHaveURL('/mylist?favorite=true');

    // フィルターの状態が復元されていることを確認
    await expect(favoriteFilter).toHaveValue('true');
  });

  test('should handle direct URL access with filters', async ({ page }) => {
    // テストデータを作成
    await seedVideoData('test-user-id', 10, { favoriteCount: 5, skipCount: 2 });

    // フィルター付きURLに直接アクセス
    await page.goto('/mylist?favorite=true&skip=false');
    await page.waitForLoadState('networkidle');

    // フィルターの状態が反映されることを確認
    const favoriteFilter = page.getByRole('combobox', { name: 'お気に入り' });
    const skipFilter = page.getByRole('combobox', { name: 'スキップ' });

    await expect(favoriteFilter).toHaveValue('true');
    await expect(skipFilter).toHaveValue('false');
  });
});
