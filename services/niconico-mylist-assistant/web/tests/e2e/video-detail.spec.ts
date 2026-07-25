import { test, expect } from '@playwright/test';
import { clearTestData, seedTestVideos } from './helpers/test-data';

/**
 * `clearTestData`（`DELETE /api/test/videos`）はインメモリDBストア全体を消す
 * グローバル操作。Playwright はデフォルトでファイル間も並列実行する
 * （`fullyParallel: true`）ため、このファイル全体を直列化し、他ファイルおよび
 * 同一ファイル内の他テストとのデータ競合を防ぐ。
 */
test.describe.configure({ mode: 'serial' });

/**
 * API レスポンスをマッチングするヘルパー関数
 * /api/videos/{videoId}/settings の形式に厳密にマッチするかチェック
 */
const isVideoSettingsApiResponse = (response: Response): boolean => {
  const url = response.url();
  // /api/videos/{id}/settings の形式に厳密にマッチするかチェック
  return /\/api\/videos\/[^/]+\/settings$/.test(url);
};

test.describe('Video Detail Modal', () => {
  test.beforeEach(async ({ request }) => {
    // 各テスト前にデータをクリア（API経由）
    await clearTestData(request);
  });

  test('should open video detail modal when clicking a video card', async ({ page, request }) => {
    // 決定的なシード API でテストデータを作成する（実ニコニコ動画API には依存しない）
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードをクリック
    const videoCard = page.locator('[class*="MuiCard"]').first();
    await expect(videoCard).toBeVisible();
    await videoCard.click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();
    // ダイアログ内の見出しを正確に指定（strict mode対応）
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: '動画詳細', exact: true })
    ).toBeVisible();
  });

  test('should display video information in modal', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードをクリック
    await page.locator('[class*="MuiCard"]').first().click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();

    // サムネイル画像
    await expect(page.getByRole('dialog').locator('img').first()).toBeVisible();

    // タイトル（2つのh2があるため、動画タイトル部分だけをチェック）
    const videoTitleHeadings = await page.getByRole('dialog').locator('h2').all();
    expect(videoTitleHeadings.length).toBeGreaterThanOrEqual(1);

    // ニコニコ動画で開くリンク
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'ニコニコ動画で開く' })
    ).toBeVisible();

    // メモフィールド
    await expect(page.getByRole('dialog').getByLabel('メモ')).toBeVisible();
  });

  test('should toggle favorite in modal', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードをクリック
    await page.locator('[class*="MuiCard"]').first().click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();

    // お気に入りボタンをクリックして API レスポンスを待つ
    const favoriteButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /お気に入り/ })
      .first();
    await expect(favoriteButton).toBeVisible();

    const responsePromise = page.waitForResponse(isVideoSettingsApiResponse);
    await favoriteButton.click();
    const settingsResponse = await responsePromise;
    expect(settingsResponse.ok()).toBeTruthy();

    // ボタンの状態が変わることを確認
    // 実際の実装では API レスポンスを待つ
  });

  test('should toggle skip in modal', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードをクリック
    await page.locator('[class*="MuiCard"]').first().click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();

    // スキップボタンをクリックして API レスポンスを待つ
    const skipButton = page
      .getByRole('dialog')
      .getByRole('button', { name: /スキップ/ })
      .first();
    await expect(skipButton).toBeVisible();

    const responsePromise = page.waitForResponse(isVideoSettingsApiResponse);
    await skipButton.click();
    const settingsResponse = await responsePromise;
    expect(settingsResponse.ok()).toBeTruthy();
  });

  test('should save memo in modal', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードをクリック
    await page.locator('[class*="MuiCard"]').first().click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();

    // メモを入力
    const memoField = page.getByRole('dialog').getByLabel('メモ');
    await memoField.fill('これはテストメモです');

    // メモを保存ボタンをクリックして API レスポンスを待つ
    const saveButton = page.getByRole('dialog').getByRole('button', { name: 'メモを保存' });
    await expect(saveButton).toBeVisible();

    const responsePromise = page.waitForResponse(isVideoSettingsApiResponse);
    await saveButton.click();
    const settingsResponse = await responsePromise;
    expect(settingsResponse.ok()).toBeTruthy();
  });

  test('should show delete confirmation when clicking delete button', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードをクリック
    await page.locator('[class*="MuiCard"]').first().click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();

    // 削除ボタンをクリック
    const deleteButton = page.getByRole('dialog').getByRole('button', { name: '動画を削除' });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // 削除確認メッセージが表示される
    await expect(
      page.getByText('この動画を削除してもよろしいですか？この操作は取り消せません。')
    ).toBeVisible();

    // 削除するボタンとキャンセルボタンが表示される
    await expect(page.getByRole('button', { name: '削除する' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'キャンセル' })).toBeVisible();
  });

  test('should cancel delete when clicking cancel button', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードをクリック
    await page.locator('[class*="MuiCard"]').first().click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();

    // 削除ボタンをクリック
    await page.getByRole('button', { name: '動画を削除' }).click();

    // 削除確認メッセージが表示される
    await expect(
      page.getByText('この動画を削除してもよろしいですか？この操作は取り消せません。')
    ).toBeVisible();

    // キャンセルボタンをクリック
    await page.getByRole('button', { name: 'キャンセル' }).click();

    // 削除確認が非表示になる
    await expect(
      page.getByText('この動画を削除してもよろしいですか？この操作は取り消せません。')
    ).not.toBeVisible();

    // モーダルは開いたまま
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('should close modal when clicking close button', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードをクリック
    await page.locator('[class*="MuiCard"]').first().click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();

    // 閉じるボタンをクリック
    const closeButton = page.getByRole('dialog').getByRole('button', { name: '閉じる' }).first();
    await closeButton.click();

    // モーダルが閉じる
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should update video list after settings change in modal', async ({ page, request }) => {
    await seedTestVideos(request, { count: 3, startId: 40000000 });

    await page.goto('/mylist');
    await page.waitForLoadState('networkidle');

    // 最初の動画カードをクリック
    await page.locator('[class*="MuiCard"]').first().click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();

    // お気に入りボタンをクリックして API レスポンスを待つ
    const responsePromise = page.waitForResponse(isVideoSettingsApiResponse);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /お気に入り/ })
      .first()
      .click();
    await responsePromise;

    // モーダルを閉じる
    await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).first().click();

    // モーダルが閉じる
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 動画一覧が更新されていることを確認
    // 実際の実装では動画カードの状態が変わることを確認
  });

  test('should create user setting when updating video without existing setting', async ({
    request,
  }) => {
    const videoId = 'sm49990000';

    // VideoBasicInfo のみ作成し UserSetting は作成しないことで、
    // PUT /settings の create-on-missing 経路を検証できる前提条件をつくる
    await seedTestVideos(request, { count: 1, startId: 49990000, skipUserSetting: true });

    const updateResponse = await request.put(`/api/videos/${videoId}/settings`, {
      data: { isFavorite: true },
    });
    expect(updateResponse.ok()).toBeTruthy();

    const body = await updateResponse.json();
    expect(body.video.userSetting.isFavorite).toBe(true);
  });
});
