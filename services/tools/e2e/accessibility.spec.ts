import { test, expect, dismissMigrationDialogIfVisible } from './helpers';

/**
 * Accessibility Tests for Tools App
 * Tests WCAG 2.1 Level AA compliance using @axe-core/playwright
 *
 * Tag: @a11y
 */

test.describe('Accessibility Tests - Homepage @a11y', () => {
  test('should not have accessibility violations on homepage', async ({ page, makeAxeBuilder }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await makeAxeBuilder().analyze();

    // Check for violations
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper heading hierarchy on homepage', async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);

    // Check for h1 tag
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(/Tools.*便利なツール集/i);
  });

  test('should have accessible tool cards', async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);

    // Tool cards should be links with accessible names
    const toolCard = page.getByRole('link', { name: /乗り換え変換ツール/i });
    await expect(toolCard).toBeVisible();

    // Check that the link has a valid href
    await expect(toolCard).toHaveAttribute('href', '/transit-converter');
  });
});

test.describe('Accessibility Tests - Transit Converter @a11y', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/transit-converter');
    await dismissMigrationDialogIfVisible(page);
  });

  test('should not have accessibility violations in initial state', async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await makeAxeBuilder().analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should not have accessibility violations after input', async ({ page, makeAxeBuilder }) => {
    const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
    await inputField.fill('渋谷 ⇒ 新宿\n2025年1月15日(月)\n09:00 ⇒ 09:15');

    const accessibilityScanResults = await makeAxeBuilder().analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should not have accessibility violations after conversion', async ({
    page,
    makeAxeBuilder,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }

    const validInput = `渋谷 ⇒ 新宿
2025年1月15日(月)
09:00 ⇒ 09:15
------------------------------
所要時間 15分
運賃[IC優先] 200円
乗換 0回
距離 5.2 km
------------------------------

■渋谷
↓ 09:00〜09:15
↓ JR山手線 池袋行
↓ 3番線発 → 15番線着
■新宿`;

    const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
    await inputField.fill(validInput);

    const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
    await convertButton.click();

    // Wait for conversion to complete
    await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });

    const accessibilityScanResults = await makeAxeBuilder().analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should not have accessibility violations with error state', async ({
    page,
    makeAxeBuilder,
  }) => {
    const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
    await inputField.fill('Invalid transit text');

    const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
    await convertButton.click();

    // Wait for error to appear
    await page.waitForTimeout(2000);

    const accessibilityScanResults = await makeAxeBuilder().analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper form labels', async ({ page }) => {
    // Check for textarea labels
    const inputSection = page.locator('text=入力').locator('..');
    await expect(inputSection).toBeVisible();

    const outputSection = page.locator('text=出力').locator('..');
    await expect(outputSection).toBeVisible();
  });

  test('should have accessible buttons with ARIA labels', async ({ page }) => {
    // All main buttons should have proper aria-label
    const readButton = page.getByRole('button', {
      name: 'クリップボードから乗り換え案内テキストを読み取る',
    });
    await expect(readButton).toHaveAttribute('aria-label');

    const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
    await expect(convertButton).toHaveAttribute('aria-label');

    const copyButton = page.getByRole('button', { name: '変換結果をクリップボードにコピーする' });
    await expect(copyButton).toHaveAttribute('aria-label');

    const clearButton = page.getByRole('button', { name: '入力と出力をクリアする' });
    await expect(clearButton).toHaveAttribute('aria-label');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Check for h1 or h4 heading
    const heading = page.locator('h1, h4').filter({ hasText: /乗り換え変換/ });
    await expect(heading).toBeVisible();
  });
});

test.describe('Accessibility Tests - Offline Page @a11y', () => {
  test('should not have accessibility violations on offline page', async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.goto('/offline');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await makeAxeBuilder().analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper heading on offline page', async ({ page }) => {
    await page.goto('/offline');

    // Check for heading
    const heading = page.locator('h1, h2, h3, h4').first();
    await expect(heading).toBeVisible();
  });
});

test.describe('Accessibility Tests - Common Components @a11y', () => {
  test('should have accessible header navigation', async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);

    // Header should be a landmark
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // App name link should be accessible
    const appLink = page.getByRole('link', { name: /Tools/i }).first();
    await expect(appLink).toBeVisible();
    await expect(appLink).toHaveAttribute('href', '/');
  });

  test('should have accessible footer', async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);

    // Footer should be a landmark
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Version info should be visible
    const version = footer.getByText(/v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible();
  });
});

test.describe('Accessibility Tests - WCAG 2.1 Specific Checks @a11y', () => {
  test('should pass WCAG 2.1 Level A checks on homepage', async ({ page, makeAxeBuilder }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await makeAxeBuilder()
      .withTags(['wcag2a', 'wcag21a'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should pass WCAG 2.1 Level AA checks on homepage', async ({ page, makeAxeBuilder }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await makeAxeBuilder()
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should pass WCAG 2.1 Level A checks on transit converter', async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.goto('/transit-converter');
    await dismissMigrationDialogIfVisible(page);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await makeAxeBuilder()
      .withTags(['wcag2a', 'wcag21a'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should pass WCAG 2.1 Level AA checks on transit converter', async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.goto('/transit-converter');
    await dismissMigrationDialogIfVisible(page);
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await makeAxeBuilder()
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
