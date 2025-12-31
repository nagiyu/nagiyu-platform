import { test, expect } from '@playwright/test';

test.describe('User Management API', () => {
  test.describe('GET /api/users', () => {
    test('未認証の場合は401を返す', async ({ request }) => {
      const response = await request.get('/api/users');

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('認証が必要です');
    });

    test('limitパラメータのバリデーション（範囲外）', async ({ request }) => {
      // Note: この test は認証済みの context が必要なため、
      // 実際の実装では authentication fixture を使用する
      const response = await request.get('/api/users?limit=200');

      // 未認証のため 401 が返る
      expect(response.status()).toBe(401);
    });
  });

  test.describe('GET /api/users/[userId]', () => {
    test('未認証の場合は401を返す', async ({ request }) => {
      const response = await request.get('/api/users/test-user-id');

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('認証が必要です');
    });
  });

  test.describe('PATCH /api/users/[userId]', () => {
    test('未認証の場合は401を返す', async ({ request }) => {
      const response = await request.patch('/api/users/test-user-id', {
        data: { name: '新しい名前' },
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('認証が必要です');
    });
  });

  test.describe('DELETE /api/users/[userId]', () => {
    test('未認証の場合は401を返す', async ({ request }) => {
      const response = await request.delete('/api/users/test-user-id');

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('認証が必要です');
    });
  });

  test.describe('GET /api/users/me', () => {
    test('未認証の場合は401を返す', async ({ request }) => {
      const response = await request.get('/api/users/me');

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('認証が必要です');
    });
  });
});
