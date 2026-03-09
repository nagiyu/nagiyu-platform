import { expect, test } from '@playwright/test';

test.describe('Video Search API', () => {
  test('should return 400 when query is missing', async ({ request }) => {
    const response = await request.get('/api/videos/search');
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
