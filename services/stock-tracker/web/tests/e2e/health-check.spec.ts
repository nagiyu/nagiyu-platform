import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('should return ok status', async ({ page }) => {
    const response = await page.goto('/api/health');
    expect(response?.status()).toBe(200);

    const data = await response?.json();
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('version');
  });
});

test.describe('Homepage', () => {
  test('should display Stock Tracker title', async ({ page }) => {
    await page.goto('/');

    // Check for page title
    await expect(page.locator('h1')).toContainText('Stock Tracker');

    // Check for description
    await expect(page.locator('p')).toContainText('株価追跡・通知サービス');
  });

  test('should have proper meta tags', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/Stock Tracker/);
  });
});
