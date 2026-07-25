import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * ニコニコ資格情報をダミーブロブで seed する（テスト専用エンドポイント）
 *
 * Phase 2 では register API はリクエストボディの userSession を使わず、
 * サーバー保存済みの資格情報（DynamoDB）を読む。
 * E2E 環境では実際の暗号化が行えないため、テスト専用エンドポイントでダミーを seed する。
 */
async function seedSession(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/test/session');
  expect(response.status()).toBe(200);
}

/**
 * seed した資格情報を削除する（クリーンアップ用）
 */
async function deleteSession(request: APIRequestContext): Promise<void> {
  await request.delete('/api/test/session');
}

async function clearAllTestData(request: APIRequestContext): Promise<void> {
  const response = await request.delete('/api/test/videos');
  expect(response.status()).toBe(200);
}

async function importVideos(
  request: APIRequestContext,
  startId: number,
  count: number,
  favoriteCount: number = 0
): Promise<void> {
  const response = await request.post('/api/test/videos', {
    data: { startId, count, favoriteCount },
  });
  expect(response.status()).toBe(200);
}

/**
 * Phase 2 の register リクエストボディを生成する
 *
 * userSession はボディに含めない（Phase 2 ではサーバー保存済みの資格情報を使用する）。
 */
function createRegisterRequestBody(maxCount: number, favoriteOnly?: boolean) {
  return {
    maxCount,
    favoriteOnly,
    excludeSkip: false,
    mylistName: 'E2Eテスト用マイリスト',
  };
}

test.describe('/api/mylist/register', () => {
  test.beforeEach(async ({ request }) => {
    await clearAllTestData(request);
    // Phase 2: register API はサーバー保存済みの資格情報を参照するため、先に seed する
    await seedSession(request);
  });

  test.afterEach(async ({ request }) => {
    // seed した資格情報を削除してテスト間の状態を分離する
    await deleteSession(request);
  });

  test('50件中30件指定で一括登録できる', async ({ request }) => {
    await importVideos(request, 40000000, 50);

    const response = await request.post('/api/mylist/register', {
      data: createRegisterRequestBody(30),
    });
    const body = await response.json();

    if (response.status() === 200) {
      expect(body.selectedCount).toBe(30);
      expect(body.estimatedVideos).toBe(30);
      return;
    }

    // E2E 環境では AWS Batch 投入が失敗するため 500 BATCH_ERROR を許容する
    // Phase 2 では暗号化しないため ENCRYPTION_ERROR は発生しない
    expect(response.status()).toBe(500);
    expect(body.error).toMatch(/BATCH_ERROR/);
  });

  test('150件中50件指定でも100件超のケースを処理できる', async ({ request }) => {
    await importVideos(request, 40001000, 100);
    await importVideos(request, 40001100, 50);

    const response = await request.post('/api/mylist/register', {
      data: createRegisterRequestBody(50),
    });
    const body = await response.json();

    if (response.status() === 200) {
      expect(body.selectedCount).toBe(50);
      return;
    }

    // E2E 環境では AWS Batch 投入が失敗するため 500 BATCH_ERROR を許容する
    expect(response.status()).toBe(500);
    expect(body.error).toMatch(/BATCH_ERROR/);
  });

  test('お気に入りフィルタ指定時に対象動画があれば処理される', async ({ request }) => {
    await importVideos(request, 40002000, 60, 20);

    const response = await request.post('/api/mylist/register', {
      data: createRegisterRequestBody(10, true),
    });
    const body = await response.json();

    if (response.status() === 200) {
      expect(body.selectedCount).toBe(10);
      return;
    }

    // E2E 環境では AWS Batch 投入が失敗するため 500 BATCH_ERROR を許容する
    expect(response.status()).toBe(500);
    expect(body.error).toMatch(/BATCH_ERROR/);
  });

  test('フィルタ後0件の場合は適切にエラーを返す', async ({ request }) => {
    // お気に入りなし動画を30件 import し、お気に入りフィルタで0件になることを確認
    await importVideos(request, 40003000, 30);

    const response = await request.post('/api/mylist/register', {
      data: createRegisterRequestBody(10, true),
    });
    // セッション seed 済みのため動画選定まで到達し、0件で 400 NO_VIDEOS を返す
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('NO_VIDEOS');
    expect(body.message).toBe('登録可能な動画が見つかりませんでした');
  });
});
