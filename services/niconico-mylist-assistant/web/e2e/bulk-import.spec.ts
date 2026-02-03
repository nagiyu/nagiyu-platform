import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers/test-data';

test.describe('Bulk Import API', () => {
  test.beforeEach(async () => {
    // 各テスト前にデータをクリア
    await clearTestData();
  });

  test.skip('should return 401 when not authenticated', async ({ request }) => {
    // このテストはSKIP_AUTH_CHECK=trueの環境では実行できない
    // E2Eテスト環境では常に認証がバイパスされるため、401エラーをテストできない
    // 未認証時の401エラーは API route のユニットテストで検証する
    const response = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10'],
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('認証が必要です');
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
    expect(body.error).toBeDefined();
  });

  test('should validate video ID format', async ({ request }) => {
    const response = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['invalid-id', 'sm123', 'another-invalid'],
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.invalidIds).toContain('invalid-id');
    expect(body.invalidIds).toContain('another-invalid');
  });

  test('should accept valid video IDs', async ({ request }) => {
    const response = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    // Note: このテストは実際のニコニコ動画APIを呼び出すため、
    // APIエラーや404が発生する可能性がある
    // 成功時は200、API失敗時も200だが failed カウントが含まれる
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('failed');
    expect(body).toHaveProperty('skipped');
    expect(body).toHaveProperty('total');
    expect(body.total).toBe(3);
  });
});

test.describe('Bulk Import API with Authentication', () => {
  test.beforeEach(async () => {
    // 各テスト前にデータをクリア
    await clearTestData();
  });

  test('should import videos successfully when authenticated', async ({ request }) => {
    const response = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10', 'sm11'],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('skipped');
    expect(body).toHaveProperty('failed');
    expect(body).toHaveProperty('total');
    expect(typeof body.success).toBe('number');
    expect(typeof body.skipped).toBe('number');
    expect(typeof body.failed).toBe('number');
    expect(typeof body.total).toBe('number');
    expect(body.total).toBe(3);
  });

  test('should skip already imported videos', async ({ request }) => {
    // 最初のインポート
    const firstResponse = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10'],
      },
    });

    expect(firstResponse.status()).toBe(200);

    // 同じ動画を再度インポート
    const secondResponse = await request.post('/api/videos/bulk-import', {
      data: {
        videoIds: ['sm9', 'sm10'],
      },
    });

    expect(secondResponse.status()).toBe(200);
    const body = await secondResponse.json();
    expect(typeof body.skipped).toBe('number');
    expect(body.skipped).toBe(2); // 全てスキップされる
  });
});

test.describe('Bulk Import UI', () => {
  test.beforeEach(async () => {
    // 各テスト前にデータをクリア
    await clearTestData();
  });

  test('should display import form', async ({ page }) => {
    await page.goto('/import');

    // タイトルの確認
    await expect(page.getByRole('heading', { name: '動画一括インポート' })).toBeVisible();

    // 説明文の確認
    await expect(page.getByText(/ニコニコ動画の動画 ID/)).toBeVisible();

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

    const textarea = page.getByRole('textbox');
    const importButton = page.getByRole('button', { name: 'インポート実行' });

    // 動画IDを入力
    await textarea.fill('sm9\nsm10\nsm11');

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

    const textarea = page.getByRole('textbox');
    const importButton = page.getByRole('button', { name: 'インポート実行' });

    // 101個の動画IDを入力
    const videoIds = Array.from({ length: 101 }, (_, i) => `sm${i + 1}`).join('\n');
    await textarea.fill(videoIds);

    // ボタンをクリック
    await importButton.click();

    // エラーメッセージの確認
    await expect(page.getByText(/一度に登録できる動画は最大 100 件です/)).toBeVisible();
  });

  test('should parse video IDs with different separators', async ({ page }) => {
    await page.goto('/import');

    const textarea = page.getByRole('textbox');

    // 改行、カンマ、スペース混在の入力
    await textarea.fill('sm9,sm10 sm11\nsm12');

    // 4つのIDが認識されることを確認するため、ボタンが有効化される
    const importButton = page.getByRole('button', { name: 'インポート実行' });
    await expect(importButton).toBeEnabled();
  });
});

test.describe('Bulk Import Navigation', () => {
  test.beforeEach(async () => {
    // 各テスト前にデータをクリア
    await clearTestData();
  });

  test('should have navigation links', async ({ page }) => {
    await page.goto('/import');

    // ナビゲーションリンクの確認（AppBar内のボタンに限定）
    const toolbar = page.locator('header[class*="MuiAppBar"] [class*="MuiToolbar"]');
    await expect(toolbar.getByRole('button', { name: 'ホーム' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'インポート' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: '動画一覧' })).toBeVisible();
  });

  test('should navigate to home when clicking home button', async ({ page }) => {
    await page.goto('/import');

    const toolbar = page.locator('header[class*="MuiAppBar"] [class*="MuiToolbar"]');
    const homeButton = toolbar.getByRole('button', { name: 'ホーム' });
    await homeButton.click();

    // ホームページに遷移
    await expect(page).toHaveURL('/');
  });
});
