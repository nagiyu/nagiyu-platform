import { expect, test } from '@playwright/test';

test.describe('Video Search API', () => {
  test.skip('should return 401 when not authenticated', async ({ request }) => {
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
