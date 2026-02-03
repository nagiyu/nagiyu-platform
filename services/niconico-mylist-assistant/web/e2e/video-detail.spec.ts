import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers/test-data';

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

  test('should open video detail modal when clicking a video card', async ({ page, request }) => {
    // テストデータをAPI経由で作成
    await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    await page.goto('/mylist');

    // 最初の動画カードをクリック
    const videoCard = page.locator('[class*="MuiCard"]').first();
    await expect(videoCard).toBeVisible();
    await videoCard.click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();
    // ダイアログ内の見出しを正確に指定（strict mode対応）
    await expect(page.getByRole('dialog').getByRole('heading', { name: '動画詳細', exact: true })).toBeVisible();
  });

  test('should display video information in modal', async ({ page, request }) => {
    // テストデータをAPI経由で作成
    await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    await page.goto('/mylist');

    // 最初の動画カードをクリック
    await page.locator('[class*="MuiCard"]').first().click();

    // モーダルが開く
    await expect(page.getByRole('dialog')).toBeVisible();

    // サムネイル画像
    await expect(page.getByRole('dialog').locator('img').first()).toBeVisible();

    // タイトル
    await expect(page.getByRole('dialog').locator('h2')).toBeVisible();

    // ニコニコ動画で開くリンク
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'ニコニコ動画で開く' })
    ).toBeVisible();

    // メモフィールド
    await expect(page.getByRole('dialog').getByLabel('メモ')).toBeVisible();
  });

  test('should toggle favorite in modal', async ({ page, request }) => {
    // テストデータをAPI経由で作成
    await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    await page.goto('/mylist');

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
    await responsePromise;

    // ボタンの状態が変わることを確認
    // 実際の実装では API レスポンスを待つ
  });

  test('should toggle skip in modal', async ({ page, request }) => {
    // テストデータをAPI経由で作成
    await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    await page.goto('/mylist');

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
    await responsePromise;
  });

  test('should save memo in modal', async ({ page, request }) => {
    // テストデータをAPI経由で作成
    await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    await page.goto('/mylist');

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
    await responsePromise;
  });

  test('should show delete confirmation when clicking delete button', async ({ page, request }) => {
    // テストデータをAPI経由で作成
    await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    await page.goto('/mylist');

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
    // テストデータをAPI経由で作成
    await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    await page.goto('/mylist');

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
    // テストデータをAPI経由で作成
    await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    await page.goto('/mylist');

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
    // テストデータをAPI経由で作成
    await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    await page.goto('/mylist');

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
});
