import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('should return ok status', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('stock-tracker-web');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('version');
  });
});
