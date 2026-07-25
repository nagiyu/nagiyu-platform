import { expect, test } from '@playwright/test';

const REGISTERED_LABEL = '追加済み（登録済）';

test.describe('Video Search API', () => {
  test('should return 401 when not authenticated', async ({ request }) => {
    test.skip(
      process.env.SKIP_AUTH_CHECK === 'true',
      'SKIP_AUTH_CHECK=true のE2E環境では未認証ケースを再現できないため'
    );
    const response = await request.get('/api/videos/search?q=test');
    expect(response.status()).toBe(401);
  });

  test('should return 400 when query is missing', async ({ request }) => {
    const response = await request.get('/api/videos/search');
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: '検索キーワードを入力してください',
    });
  });

  test('should return 400 when query is empty string', async ({ request }) => {
    const response = await request.get('/api/videos/search?q=');
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: '検索キーワードを入力してください',
    });
  });

  test('should return 400 when query is only spaces', async ({ request }) => {
    const response = await request.get('/api/videos/search?q=%20%20%20');
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: '検索キーワードを入力してください',
    });
  });

  test('should return 400 when query is too long', async ({ request }) => {
    const response = await request.get(`/api/videos/search?q=${'a'.repeat(101)}`);
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: '検索キーワードは 100 文字以内で入力してください',
    });
  });
});

test.describe('Video Search Modal - Existing Video Detection', () => {
  test('should show already-added label when search result is registered', async ({ page }) => {
    await page.addInitScript(() => {
      const originalFetch = window.fetch;

      const resolveRequestUrl = (input: URL | RequestInfo): string => {
        if (typeof input === 'string') return input;
        if (input instanceof URL) return input.toString();
        if (input instanceof Request) return input.url;
        return String(input);
      };

      window.fetch = async (input, init) => {
        const requestUrl = resolveRequestUrl(input);

        if (requestUrl.includes('/api/videos/search')) {
          return new Response(
            JSON.stringify({
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
                  isRegistered: true,
                },
              ],
              total: 1,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return originalFetch(input, init);
      };
    });

    await page.goto('/import');
    await page.getByRole('button', { name: '動画を検索して追加' }).click();
    const keywordInput = page.getByLabel('検索キーワード');
    await keywordInput.waitFor({ state: 'visible' });
    await keywordInput.fill('陰陽師');
    await page.getByRole('button', { name: '検索' }).click();

    const searchDialog = page.getByRole('dialog', { name: '動画検索' });
    const registeredButton = searchDialog.getByRole('button', { name: REGISTERED_LABEL });
    await expect(registeredButton).toBeVisible();
    await expect(registeredButton).toHaveText(REGISTERED_LABEL);
    await expect(registeredButton).toBeDisabled();
  });
});

test.describe('Video Search Modal - Enter Key Search', () => {
  test('should execute search when Enter key is pressed in keyword input', async ({ page }) => {
    // /api/videos/search の fetch をモックしてダミーの動画を返す
    await page.addInitScript(() => {
      const originalFetch = window.fetch;

      const resolveRequestUrl = (input: URL | RequestInfo): string => {
        if (typeof input === 'string') return input;
        if (input instanceof URL) return input.toString();
        if (input instanceof Request) return input.url;
        return String(input);
      };

      window.fetch = async (input, init) => {
        const requestUrl = resolveRequestUrl(input);

        if (requestUrl.includes('/api/videos/search')) {
          return new Response(
            JSON.stringify({
              videos: [
                {
                  videoId: 'sm12345',
                  title: 'エンターキー検索テスト動画',
                  description: 'エンターキーで検索が実行されることを確認するテスト',
                  thumbnailUrl: 'https://example.com/thumb-enter.jpg',
                  duration: 60,
                  viewCount: 100,
                  commentCount: 10,
                  mylistCount: 5,
                  uploadedAt: '2024-01-01T00:00:00+09:00',
                  tags: [],
                  isRegistered: false,
                },
              ],
              total: 1,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return originalFetch(input, init);
      };
    });

    await page.goto('/import');
    // 「動画を検索して追加」ボタンをクリックして検索モーダルを開く
    await page.getByRole('button', { name: '動画を検索して追加' }).click();
    const keywordInput = page.getByLabel('検索キーワード');
    await keywordInput.waitFor({ state: 'visible' });

    // キーワードを入力し、ボタンをクリックせずエンターキーで検索を実行する
    await keywordInput.fill('エンターキー検索');
    await keywordInput.press('Enter');

    // モックで返した動画タイトルと videoId がダイアログ内に表示されることを確認する
    const searchDialog = page.getByRole('dialog', { name: '動画検索' });
    await expect(searchDialog.getByText('エンターキー検索テスト動画')).toBeVisible();
    await expect(searchDialog.getByText('sm12345')).toBeVisible();
  });
});
