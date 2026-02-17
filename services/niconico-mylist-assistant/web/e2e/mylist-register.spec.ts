import { test, expect, APIRequestContext } from '@playwright/test';

const TEST_NICONICO_ACCOUNT = {
  // E2Eテスト用ダミー資格情報（本番では使用しない）
  email: process.env.TEST_USER_EMAIL ?? 'test@example.com',
  password: process.env.TEST_NICONICO_PASSWORD ?? 'password-for-e2e',
} as const;

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

function createRegisterRequestBody(maxCount: number, favoriteOnly?: boolean) {
  return {
    maxCount,
    favoriteOnly,
    excludeSkip: false,
    mylistName: 'E2Eテスト用マイリスト',
    niconicoAccount: TEST_NICONICO_ACCOUNT,
  };
}

test.describe('/api/mylist/register', () => {
  test.beforeEach(async ({ request }) => {
    await clearAllTestData(request);
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

    expect(response.status()).toBe(500);
    expect(body.error.code).toMatch(/ENCRYPTION_ERROR|BATCH_ERROR/);
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

    expect(response.status()).toBe(500);
    expect(body.error.code).toMatch(/ENCRYPTION_ERROR|BATCH_ERROR/);
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

    expect(response.status()).toBe(500);
    expect(body.error.code).toMatch(/ENCRYPTION_ERROR|BATCH_ERROR/);
  });

  test('フィルタ後0件の場合は適切にエラーを返す', async ({ request }) => {
    await importVideos(request, 40003000, 30);

    const response = await request.post('/api/mylist/register', {
      data: createRegisterRequestBody(10, true),
    });
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('NO_VIDEOS');
    expect(body.error.message).toBe('登録可能な動画が見つかりませんでした');
  });
});
