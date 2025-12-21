import { test as base, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Extended test fixture with accessibility testing support
 */
export const test = base.extend({
  /**
   * Automatically run accessibility tests on each page
   */
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = () =>
      new AxeBuilder({ page }).withTags([
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag21aa',
      ]);
    await use(makeAxeBuilder);
  },
});

export { expect } from '@playwright/test';

/**
 * Helper function to wait for network idle
 */
export async function waitForNetworkIdle(
  page: Page,
  timeout = 5000
): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Helper function to take screenshot with timestamp
 */
export async function takeTimestampedScreenshot(
  page: Page,
  name: string
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `screenshots/${name}-${timestamp}.png` });
}

/**
 * Helper function to dismiss the migration dialog if it appears
 * This should be called after navigating to a page where the dialog might appear
 */
export async function dismissMigrationDialogIfVisible(
  page: Page
): Promise<void> {
  try {
    const closeButton = page.getByRole('button', { name: /閉じる/i });
    const isVisible = await closeButton.isVisible({ timeout: 1000 }).catch(() => false);
    
    if (isVisible) {
      await closeButton.click();
      // Wait for the dialog to be dismissed
      await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
    }
  } catch (error) {
    // Dialog not present or already dismissed, continue
  }
}
