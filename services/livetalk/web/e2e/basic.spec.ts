import { test, expect } from '@playwright/test';

test.describe('LiveTalk - Basic Functionality', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/LiveTalk/);

    await expect(page.getByRole('heading', { name: /Hello, LiveTalk!/ })).toBeVisible();
  });

  test('should respond from health endpoint', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('should have responsive layout on mobile', async ({ page, isMobile }) => {
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();

    if (isMobile) {
      const viewport = page.viewportSize();
      expect(viewport?.width).toBeLessThan(768);
    }
  });
});
