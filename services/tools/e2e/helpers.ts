import { test as base, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Timeout constants for test stability
 */
export const TIMEOUTS = {
  DIALOG_APPEARANCE: 1000,
  DIALOG_DISMISS: 5000,
  ANIMATION_COMPLETION: 500,
  SERVICE_WORKER_READY: 2000,
  PAGE_READY: 1000,
} as const;

/**
 * Extended test fixture with accessibility testing support
 */
export const test = base.extend({
  /**
   * Automatically run accessibility tests on each page
   */
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = () =>
      new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    await use(makeAxeBuilder);
  },
});

export { expect } from '@playwright/test';

/**
 * Helper function to wait for network idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 5000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Helper function to take screenshot with timestamp
 */
export async function takeTimestampedScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `screenshots/${name}-${timestamp}.png` });
}

/**
 * Helper function to dismiss the migration dialog if it appears
 * This should be called after navigating to a page where the dialog might appear
 */
export async function dismissMigrationDialogIfVisible(page: Page): Promise<void> {
  try {
    // Wait for the page to be loaded first
    await page.waitForLoadState('domcontentloaded');

    // Wait a bit for the dialog to appear if it's going to
    await page.waitForTimeout(TIMEOUTS.DIALOG_APPEARANCE);

    // Try to find and close the dialog
    const dialog = page.getByRole('dialog');

    // Wait for either the dialog to appear or timeout
    const dialogAppeared = await dialog.waitFor({
      state: 'visible',
      timeout: TIMEOUTS.DIALOG_APPEARANCE
    }).then(() => true).catch(() => false);

    if (dialogAppeared) {
      // Find the close button
      const closeButton = page.getByRole('button', { name: /閉じる/i });
      await closeButton.click();

      // Wait for the dialog to be completely dismissed
      await dialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.DIALOG_DISMISS });

      // Give it time for any animations and DOM updates
      await page.waitForTimeout(TIMEOUTS.ANIMATION_COMPLETION);
    }

    // Always wait for the page content to be ready
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(TIMEOUTS.PAGE_READY);
  } catch (error) {
    // Dialog not present or already dismissed, continue
    // Still wait for page to be ready
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(TIMEOUTS.PAGE_READY);
  }
}
