import { test, expect } from '@playwright/test';

test.describe('Portal App - Basic Functionality', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Check if the page has a title
    await expect(page).toHaveTitle(/.+/);

    // Check if the main content area is visible
    await expect(page.locator('body')).toBeVisible();
  });

  // トップに加え、表を含む記事と長いインラインコードを含む記事を対象にする。
  // html/body 側で横はみ出しを切り落とさないため、本文の折り返し・表のスクロール化が崩れると検知できる
  const mobileWidth = 375;
  const mobilePaths = [
    '/',
    '/tech/aws-account-restriction-recovery',
    '/tech/cdk-cross-stack-ssm-parameter-store',
  ];

  for (const path of mobilePaths) {
    test(`モバイル幅で横スクロールが発生しない (${path})`, async ({ page }) => {
      await page.setViewportSize({ width: mobileWidth, height: 667 });
      await page.goto(path);

      await expect(page.locator('body')).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(mobileWidth);
    });
  }
});
