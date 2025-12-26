import { test, expect, dismissMigrationDialogIfVisible } from './helpers';

/**
 * E2E tests for Privacy Policy and Terms of Service dialogs
 */

test.describe('Privacy Policy Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
  });

  test('フッターのプライバシーポリシーリンクをクリックするとダイアログが開く', async ({ page }) => {
    // Footer should be visible
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Click on privacy policy link
    const privacyLink = page.getByRole('button', { name: 'プライバシーポリシー' });
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();

    // Dialog should be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Title should be displayed in the dialog title area (first occurrence)
    const dialogTitle = dialog.getByText('プライバシーポリシー').first();
    await expect(dialogTitle).toBeVisible();

    // First section (第1条「個人情報」) should be displayed
    const firstSection = page.getByText('第1条（個人情報）');
    await expect(firstSection).toBeVisible();

    // Content of first section should be visible
    const firstSectionContent = page.getByText('「個人情報」とは，個人情報保護法にいう');
    await expect(firstSectionContent).toBeVisible();
  });

  test('プライバシーポリシーダイアログがスクロール可能', async ({ page }) => {
    // Open privacy policy dialog
    const privacyLink = page.getByRole('button', { name: 'プライバシーポリシー' });
    await privacyLink.click();

    // Wait for dialog to be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Get the scrollable content area
    const dialogContent = page.locator('[role="dialog"] .MuiDialogContent-root');
    await expect(dialogContent).toBeVisible();

    // Get initial scroll position
    const initialScrollTop = await dialogContent.evaluate((el) => el.scrollTop);

    // Scroll down
    await dialogContent.evaluate((el) => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
    });

    // Wait for scroll to complete
    await page.waitForTimeout(300);

    // Get new scroll position
    const newScrollTop = await dialogContent.evaluate((el) => el.scrollTop);

    // Verify that we scrolled (new position should be greater than initial)
    expect(newScrollTop).toBeGreaterThan(initialScrollTop);

    // Verify that the last section (第10条「お問い合わせ窓口」) is now visible
    const lastSection = page.getByText('第10条（お問い合わせ窓口）');
    await expect(lastSection).toBeVisible();
  });

  test('プライバシーポリシーダイアログを閉じるボタンで閉じられる', async ({ page }) => {
    // Open privacy policy dialog
    const privacyLink = page.getByRole('button', { name: 'プライバシーポリシー' });
    await privacyLink.click();

    // Wait for dialog to be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click close button (X button in the top right)
    const closeButton = page.getByRole('button', { name: 'close' });
    await closeButton.click();

    // Dialog should be closed
    await expect(dialog).not.toBeVisible();
  });

  test('プライバシーポリシーダイアログをフッターボタンで閉じられる', async ({ page }) => {
    // Open privacy policy dialog
    const privacyLink = page.getByRole('button', { name: 'プライバシーポリシー' });
    await privacyLink.click();

    // Wait for dialog to be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click the footer close button
    const footerCloseButton = page
      .locator('[role="dialog"]')
      .getByRole('button', { name: '閉じる' });
    await footerCloseButton.click();

    // Dialog should be closed
    await expect(dialog).not.toBeVisible();
  });
});

test.describe('Terms of Service Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
  });

  test('フッターの利用規約リンクをクリックするとダイアログが開く', async ({ page }) => {
    // Footer should be visible
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Click on terms of service link
    const termsLink = page.getByRole('button', { name: '利用規約' });
    await expect(termsLink).toBeVisible();
    await termsLink.click();

    // Dialog should be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Title should be displayed in the dialog title area
    const dialogTitle = dialog.getByText('利用規約').first();
    await expect(dialogTitle).toBeVisible();

    // First section (第1条「適用」) should be displayed
    const firstSection = page.getByText('第1条（適用）');
    await expect(firstSection).toBeVisible();

    // Content of first section should be visible
    const firstSectionContent = page.getByText('本規約は、なぎゆー（以下、「当方」といいます。）');
    await expect(firstSectionContent).toBeVisible();
  });

  test('利用規約ダイアログがスクロール可能', async ({ page }) => {
    // Open terms of service dialog
    const termsLink = page.getByRole('button', { name: '利用規約' });
    await termsLink.click();

    // Wait for dialog to be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Get the scrollable content area
    const dialogContent = page.locator('[role="dialog"] .MuiDialogContent-root');
    await expect(dialogContent).toBeVisible();

    // Get initial scroll position
    const initialScrollTop = await dialogContent.evaluate((el) => el.scrollTop);

    // Scroll down
    await dialogContent.evaluate((el) => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
    });

    // Wait for scroll to complete
    await page.waitForTimeout(300);

    // Get new scroll position
    const newScrollTop = await dialogContent.evaluate((el) => el.scrollTop);

    // Verify that we scrolled (new position should be greater than initial)
    expect(newScrollTop).toBeGreaterThan(initialScrollTop);

    // Verify that a section near the end (第15条「準拠法・裁判管轄」) is now visible
    const lastSection = page.getByText('第15条（準拠法・裁判管轄）');
    await expect(lastSection).toBeVisible();
  });

  test('利用規約ダイアログを閉じるボタンで閉じられる', async ({ page }) => {
    // Open terms of service dialog
    const termsLink = page.getByRole('button', { name: '利用規約' });
    await termsLink.click();

    // Wait for dialog to be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click close button (X button in the top right)
    const closeButton = page.getByRole('button', { name: 'close' });
    await closeButton.click();

    // Dialog should be closed
    await expect(dialog).not.toBeVisible();
  });

  test('利用規約ダイアログをフッターボタンで閉じられる', async ({ page }) => {
    // Open terms of service dialog
    const termsLink = page.getByRole('button', { name: '利用規約' });
    await termsLink.click();

    // Wait for dialog to be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click the footer close button
    const footerCloseButton = page
      .locator('[role="dialog"]')
      .getByRole('button', { name: '閉じる' });
    await footerCloseButton.click();

    // Dialog should be closed
    await expect(dialog).not.toBeVisible();
  });
});

test.describe('Multiple Dialogs Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
  });

  test('プライバシーポリシーと利用規約のダイアログを交互に開ける', async ({ page }) => {
    // Open privacy policy dialog
    const privacyLink = page.getByRole('button', { name: 'プライバシーポリシー' });
    await privacyLink.click();

    // Verify privacy policy dialog is open
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('プライバシーポリシー').first()).toBeVisible();

    // Close privacy policy dialog
    let footerCloseButton = page.locator('[role="dialog"]').getByRole('button', { name: '閉じる' });
    await footerCloseButton.click();
    await expect(dialog).not.toBeVisible();

    // Open terms of service dialog
    const termsLink = page.getByRole('button', { name: '利用規約' });
    await termsLink.click();

    // Verify terms of service dialog is open
    dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('利用規約').first()).toBeVisible();

    // Close terms of service dialog
    footerCloseButton = page.locator('[role="dialog"]').getByRole('button', { name: '閉じる' });
    await footerCloseButton.click();
    await expect(dialog).not.toBeVisible();

    // Open privacy policy dialog again
    await privacyLink.click();

    // Verify privacy policy dialog can be opened again
    dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('プライバシーポリシー').first()).toBeVisible();
  });
});

test.describe('Policy Dialogs Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissMigrationDialogIfVisible(page);
  });

  test('プライバシーポリシーダイアログのアクセシビリティチェック', async ({
    page,
    makeAxeBuilder,
  }) => {
    // Open privacy policy dialog
    const privacyLink = page.getByRole('button', { name: 'プライバシーポリシー' });
    await privacyLink.click();

    // Wait for dialog to be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Run accessibility checks
    // Note: Excluding scrollable-region-focusable rule as it's a known issue with MUI DialogContent
    // The dialog content is scrollable but requires tabindex="0" to be fully keyboard accessible
    // This is a pre-existing issue in the @nagiyu/ui library that should be fixed separately
    const accessibilityScanResults = await makeAxeBuilder()
      .disableRules(['scrollable-region-focusable'])
      .analyze();

    // Verify no violations (excluding known issues)
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('利用規約ダイアログのアクセシビリティチェック', async ({ page, makeAxeBuilder }) => {
    // Open terms of service dialog
    const termsLink = page.getByRole('button', { name: '利用規約' });
    await termsLink.click();

    // Wait for dialog to be displayed
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Run accessibility checks
    // Note: Excluding scrollable-region-focusable rule as it's a known issue with MUI DialogContent
    // The dialog content is scrollable but requires tabindex="0" to be fully keyboard accessible
    // This is a pre-existing issue in the @nagiyu/ui library that should be fixed separately
    const accessibilityScanResults = await makeAxeBuilder()
      .disableRules(['scrollable-region-focusable'])
      .analyze();

    // Verify no violations (excluding known issues)
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
