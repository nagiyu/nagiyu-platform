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

// 未認証時の 401 は SKIP_AUTH_CHECK=true の E2E 環境では再現できないため、
// tests/unit/app/api/videos/bulk-import/route.test.ts のユニットテストで検証する
// （未認証時に middleware がリダイレクトする経路とは別に、この API route 自身が
// getSession() で 401 を返す経路がある。この経路は middleware を経由しないため、
// middleware のユニットテストでは担保できない）。

test.describe('Bulk Import API', () => {
  test.beforeEach(async ({ request }) => {
    // 各テスト前にデータをクリア（API経由）
    await clearTestData(request);
  });

  test('should validate videoIds is an array', async ({ request }) => {
    const response = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: 'not-an-array',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('should validate videoIds is not empty', async ({ request }) => {
    const response = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: [],
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('should validate maximum 100 videos', async ({ request }) => {
    const videoIds = Array.from({ length: 101 }, (_, i) => `sm${i + 1}`);
    const response = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds,
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('一度に登録できる動画は最大 100 件です');
  });

  test('should validate video ID format', async ({ request }) => {
    const response = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['invalid-id', '12345', 'sm', 'sm@123', 'SM123', ''],
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('不正な動画 ID 形式が含まれています');
    expect(body.invalidIds).toContain('invalid-id');
    expect(body.invalidIds).toContain('12345');
    expect(body.invalidIds).toContain('sm');
    expect(body.invalidIds).toContain('sm@123');
    expect(body.invalidIds).toContain('SM123');
    expect(body.invalidIds).toContain('');
  });

  // 「標準・任意の英字接頭辞を持つ動画IDを受理する」テストは、フォーマット検証を
  // 通過させると videoIdsToImport が非空になり、getVideoInfoBatch が実ニコニコ動画API
  // （https://ext.nicovideo.jp/api/getthumbinfo/）へ実際に fetch する。この経路は
  // request フィクスチャ（ブラウザを介さないAPI直叩き）が対象のため page.route() では
  // スタブできず、実行環境からその外部ホストに到達できない場合はタイムアウトするまで
  // 待つことになり非決定的。そのため E2E からは削除し、getVideoInfoBatch をモックした
  // tests/unit/app/api/videos/bulk-import/route.test.ts の
  // 「標準・任意の英字接頭辞を持つ動画IDを受理し、getVideoInfoBatch まで到達する」で
  // 同じ検証項目（フォーマット検証を通過し getVideoInfoBatch に渡ること）を代替担保する。
});

test.describe('Bulk Import API with Authentication', () => {
  // 「認証済みでの動画インポート成功」テストも同様に、未登録の新規動画IDを渡すと
  // getVideoInfoBatch が実ニコニコ動画APIへ fetch するため request フィクスチャでは
  // スタブできず非決定的。E2E からは削除し、getVideoInfoBatch をモックした
  // tests/unit/app/api/videos/bulk-import/route.test.ts の
  // 「動画情報の取得とDB保存に成功した場合、success カウントが返る」で代替担保する。

  test('should skip already imported videos', async ({ request }) => {
    // このテストでは初期状態でクリアする
    await clearTestData(request);

    // 決定的なシード API で「既にユーザー設定を持つ動画」を直接作成する。
    // 実ニコニコ動画API経由の1回目インポートに依存すると、API側の成否で
    // このテストの前提（1回目が成功しているか）が変わってしまうため、
    // 前提条件そのものをシードで固定する。
    await seedTestVideos(request, { count: 2, startId: 40000000 });

    // 既にユーザー設定がある動画を再度インポートすると、全件スキップされる
    const response = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm40000000', 'sm40000001'],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.skipped).toBe(2);
    expect(body.success).toBe(0);
  });
});

test.describe('Bulk Import UI', () => {
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ request }) => {
    // 各テスト前にデータをクリア（API経由）
    await clearTestData(request);
  });

  const typeVideoIds = async (
    page: import('@playwright/test').Page,
    value: string
  ): Promise<void> => {
    const textarea = page.getByRole('textbox');
    await textarea.click();
    await page.keyboard.type(value);
  };

  test('should display import form', async ({ page }) => {
    await page.goto('/import');

    // タイトルの確認
    await expect(page.getByRole('heading', { name: '動画一括インポート' })).toBeVisible();

    // 説明文の確認
    await expect(page.getByText(/ニコニコ動画の動画 ID/)).toBeVisible();
    await expect(page.getByText(/sm9, so12345, nm98765/)).toBeVisible();

    // テキストエリアの確認
    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeVisible();

    // インポートボタンの確認（初期状態では無効）
    const importButton = page.getByRole('button', { name: 'インポート実行' });
    await expect(importButton).toBeVisible();
    await expect(importButton).toBeDisabled();
  });

  test('should enable import button when video IDs are entered', async ({ page }) => {
    await page.goto('/import');

    const importButton = page.getByRole('button', { name: 'インポート実行' });

    // 動画IDを入力
    await typeVideoIds(page, 'sm9\nsm10\nsm11');

    // ボタンが有効化される
    await expect(importButton).toBeEnabled();
  });

  test('should show validation error for empty input', async ({ page }) => {
    await page.goto('/import');

    const textarea = page.getByRole('textbox');
    const importButton = page.getByRole('button', { name: 'インポート実行' });

    // スペースだけを入力
    await textarea.fill('   ');

    // ボタンをクリック（無効なので実際にはクリックできない想定だが、JSで有効化されることを確認）
    await expect(importButton).toBeDisabled();
  });

  test('should show validation error for too many videos', async ({ page }) => {
    await page.goto('/import');

    const importButton = page.getByRole('button', { name: 'インポート実行' });

    // 101個の動画IDを入力
    const videoIds = Array.from({ length: 101 }, (_, i) => `sm${i + 1}`).join('\n');
    await typeVideoIds(page, videoIds);
    await expect(importButton).toBeEnabled();

    // ボタンをクリック
    await importButton.click();

    // エラーメッセージの確認
    await expect(page.getByText(/一度に登録できる動画は最大 100 件です/)).toBeVisible();
  });

  test('should parse video IDs with different separators', async ({ page }) => {
    await page.goto('/import');

    // 改行、カンマ、スペース混在の入力
    await typeVideoIds(page, 'sm9,sm10 sm11\nsm12');

    // 4つのIDが認識されることを確認するため、ボタンが有効化される
    const importButton = page.getByRole('button', { name: 'インポート実行' });
    await expect(importButton).toBeEnabled();
  });

  test('should search videos and add selected video', async ({ page }) => {
    await page.route('**/api/videos/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          videos: [
            {
              videoId: 'sm9',
              title: 'レッツゴー!陰陽師',
              description: 'desc',
              thumbnailUrl: 'https://example.com/thumb.jpg',
              duration: 120,
              viewCount: 1,
              commentCount: 1,
              mylistCount: 1,
              uploadedAt: '2007-03-06T00:33:00+09:00',
              tags: [],
            },
          ],
          total: 1,
        }),
      });
    });

    await page.route('**/api/videos/bulk-import', async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as { videoIds: string[] };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: 1,
          failed: 0,
          skipped: 0,
          total: body.videoIds.length,
        }),
      });
    });

    await page.goto('/import');
    await page.getByRole('button', { name: '動画を検索して追加' }).click();
    const keywordInput = page.getByLabel('検索キーワード');
    await keywordInput.waitFor({ state: 'visible' });
    await keywordInput.fill('陰陽師');
    await page.getByRole('button', { name: '検索' }).click();

    const searchDialog = page.getByRole('dialog', { name: '動画検索' });
    const firstMatchedVideo = page.getByRole('heading', { name: /レッツゴー[!！]陰陽師/ }).first();
    await expect(firstMatchedVideo).toBeVisible();
    await searchDialog.getByRole('button', { name: '追加', exact: true }).first().click();
    await expect(page.getByRole('button', { name: '追加済み' })).toBeVisible();
  });
});

test.describe('Bulk Import Navigation', () => {
  test.beforeEach(async ({ request }) => {
    // 各テスト前にデータをクリア（API経由）
    await clearTestData(request);
  });

  test('should have navigation links', async ({ page }) => {
    await page.goto('/import');

    // ナビゲーションリンクの確認（モバイルでは Drawer、デスクトップでは Toolbar を自動切替）
    await expectNavigationItemVisible(page, 'ホーム');
    await expectNavigationItemVisible(page, 'インポート');
    await expectNavigationItemVisible(page, '動画一覧');
  });

  test('should navigate to home when clicking home button', async ({ page }) => {
    await page.goto('/import');

    await clickNavigationItem(page, 'ホーム');

    // ホームページに遷移
    await expect(page).toHaveURL('/');
  });
});
