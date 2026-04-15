import { test, expect } from '@playwright/test';

test.describe('Portal App - Basic Functionality', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Check if the page has a title
    await expect(page).toHaveTitle(/.+/);

    // Check if the main content area is visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have responsive layout on mobile', async ({ page, isMobile }) => {
    await page.goto('/');

    // Verify the page loads successfully
    await expect(page.locator('body')).toBeVisible();

    if (isMobile) {
      // Check if viewport is mobile-sized
      const viewport = page.viewportSize();
      expect(viewport?.width).toBeLessThan(768);
    }
  });
});
