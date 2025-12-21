import { test as base, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Timeout constants for test stability
 */
export const TIMEOUTS = {
  DIALOG_APPEARANCE: 500,
  DIALOG_DISMISS: 3000,
  ANIMATION_COMPLETION: 300,
  SERVICE_WORKER_READY: 2000,
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
    // Wait a bit for the dialog to appear if it's going to
    await page.waitForTimeout(TIMEOUTS.DIALOG_APPEARANCE);
    
    // Check if the dialog is visible
    const dialog = page.getByRole('dialog');
    const isDialogVisible = await dialog.isVisible().catch(() => false);
    
    if (isDialogVisible) {
      // Find the close button
      const closeButton = page.getByRole('button', { name: /閉じる/i });
      const isButtonVisible = await closeButton.isVisible().catch(() => false);
      
      if (isButtonVisible) {
        await closeButton.click();
        // Wait for the dialog to be dismissed
        await dialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.DIALOG_DISMISS }).catch(() => {});
        // Give it a bit more time for any animations
        await page.waitForTimeout(TIMEOUTS.ANIMATION_COMPLETION);
      }
    }
  } catch (error) {
    // Dialog not present or already dismissed, continue
  }
}
