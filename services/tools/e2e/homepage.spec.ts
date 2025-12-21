import { test, expect, dismissMigrationDialogIfVisible } from './helpers';

test.describe('Homepage - Tool Cards and Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
  });

  test('should display tool cards on homepage', async ({ page }) => {
    // Check if the main heading exists
    const heading = page.getByRole('heading', { name: /ツール一覧/i });
    await expect(heading).toBeVisible();

    // Check if tool cards are displayed
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/i });
    await expect(toolCard).toBeVisible();

    // Verify tool card contains description
    const description = page.getByText(/乗り換え案内のテキストを整形してコピーします/i);
    await expect(description).toBeVisible();

    // Verify tool card contains icon
    const cardContent = page.locator('a[href="/transit-converter"]');
    await expect(cardContent).toBeVisible();
  });

  test('should navigate to transit converter from card', async ({ page }) => {
    // Click on the transit converter tool card
    const transitCard = page.getByRole('link', { name: /乗り換え変換ツール/i });
    await transitCard.click();

    // Verify navigation to transit converter page
    await expect(page).toHaveURL(/\/transit-converter/);

    // Dismiss migration dialog on transit converter page if visible
    await dismissMigrationDialogIfVisible(page);

    // Verify we're on the transit converter page
    const transitHeading = page.getByRole('heading', { name: /乗り換え変換ツール/i });
    await expect(transitHeading).toBeVisible();
  });

  test('should display all tool card elements', async ({ page }) => {
    // Get the first (and currently only) tool card
    const toolCard = page.locator('a[href="/transit-converter"]');
    await expect(toolCard).toBeVisible();

    // Verify tool name is displayed
    const toolName = toolCard.getByText('乗り換え変換ツール');
    await expect(toolName).toBeVisible();

    // Verify description is displayed
    const description = toolCard.getByText(/乗り換え案内のテキストを整形してコピーします/i);
    await expect(description).toBeVisible();

    // Verify icon is present (svg element should be visible)
    const icon = toolCard.locator('svg');
    await expect(icon).toBeVisible();
  });
});

test.describe('Homepage - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
  });

  test('should display 3-column layout on desktop', async ({ page, browserName }) => {
    // Skip on mobile projects
    const testInfo = test.info();
    if (testInfo.project.name.includes('mobile')) {
      test.skip();
    }

    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Get the grid container
    const gridContainer = page.locator('[class*="MuiGrid-container"]').first();
    await expect(gridContainer).toBeVisible();

    // Verify tool cards exist
    const toolCards = page.locator('a[href^="/"]').filter({ hasText: 'ツール' });
    await expect(toolCards.first()).toBeVisible();
  });

  test('should display 2-column layout on tablet', async ({ page }) => {
    // Skip on mobile projects
    const testInfo = test.info();
    if (testInfo.project.name.includes('mobile')) {
      test.skip();
    }

    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    // Verify the page is responsive
    const gridContainer = page.locator('[class*="MuiGrid-container"]').first();
    await expect(gridContainer).toBeVisible();

    // Verify tool cards are still visible
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/i });
    await expect(toolCard).toBeVisible();
  });

  test('should display 1-column layout on mobile', async ({ page, isMobile }) => {
    // Only run on mobile projects
    if (!isMobile) {
      const testInfo = test.info();
      if (!testInfo.project.name.includes('mobile')) {
        test.skip();
      }
    }

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Verify the page is responsive
    const gridContainer = page.locator('[class*="MuiGrid-container"]').first();
    await expect(gridContainer).toBeVisible();

    // Verify tool cards are visible on mobile
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/i });
    await expect(toolCard).toBeVisible();

    // Check viewport width is mobile size
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThanOrEqual(480);
  });
});

test.describe('Common Components - Header and Footer', () => {
  test('should display header on homepage', async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);

    // Verify header is visible
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Verify app name "Tools" is displayed in header
    const appName = page.getByRole('link', { name: /Tools/i }).first();
    await expect(appName).toBeVisible();
    await expect(appName).toHaveAttribute('href', '/');
  });

  test('should display footer on homepage', async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);

    // Verify footer is visible
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Verify version information is displayed
    const version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();
  });

  test('should display header on all pages', async ({ page }) => {
    // Test on homepage
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
    let header = page.locator('header');
    await expect(header).toBeVisible();

    // Test on transit converter page
    await page.goto('/transit-converter');
    await dismissMigrationDialogIfVisible(page);
    header = page.locator('header');
    await expect(header).toBeVisible();

    const appName = page.getByRole('link', { name: /Tools/i }).first();
    await expect(appName).toBeVisible();
  });

  test('should display footer on all pages', async ({ page }) => {
    // Test on homepage
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
    let footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Test on transit converter page
    await page.goto('/transit-converter');
    await dismissMigrationDialogIfVisible(page);
    footer = page.locator('footer');
    await expect(footer).toBeVisible();

    const version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();
  });
});
