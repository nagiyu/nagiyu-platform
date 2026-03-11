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
