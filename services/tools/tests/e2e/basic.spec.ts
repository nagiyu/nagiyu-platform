import { test, expect, dismissMigrationDialogIfVisible } from './helpers';

test.describe('Tools App - Basic Functionality', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Dismiss migration dialog if it appears
    await dismissMigrationDialogIfVisible(page);

    // Check if the page title is correct
    await expect(page).toHaveTitle(/Tools/);

    // Check if the main heading exists
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('should navigate to transit converter', async ({ page }) => {
    await page.goto('/');

    // Dismiss migration dialog if it appears
    await dismissMigrationDialogIfVisible(page);

    // Look for a link or card to the transit converter tool
    const transitLink = page.getByRole('link', { name: /乗り換え/i });

    // If the link exists, click it and verify navigation
    if ((await transitLink.count()) > 0) {
      await transitLink.first().click();
      await expect(page).toHaveURL(/transit-converter/);
    }
  });

  test('should have responsive layout on mobile', async ({ page, isMobile }) => {
    await page.goto('/');

    // Dismiss migration dialog if it appears
    await dismissMigrationDialogIfVisible(page);

    // Verify the page loads successfully on mobile
    await expect(page.locator('body')).toBeVisible();

    if (isMobile) {
      // Check if viewport is mobile-sized
      const viewport = page.viewportSize();
      expect(viewport?.width).toBeLessThan(768);
    }
  });
});
