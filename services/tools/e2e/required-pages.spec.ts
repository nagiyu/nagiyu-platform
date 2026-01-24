import { test, expect, dismissMigrationDialogIfVisible } from './helpers';

/**
 * E2E tests for required pages (Privacy, Terms, About, Contact)
 * These pages are required for Google AdSense approval
 */

test.describe('Privacy Policy Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/privacy');
    await dismissMigrationDialogIfVisible(page);
  });

  test('プライバシーポリシーページが正しく表示される', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/プライバシーポリシー - Tools/);

    // Check main heading
    const heading = page.getByRole('heading', { name: 'プライバシーポリシー', level: 1 });
    await expect(heading).toBeVisible();

    // Check first section (AdSense related)
    const firstSection = page.getByRole('heading', {
      name: /第1条（広告の配信について）/,
      level: 2,
    });
    await expect(firstSection).toBeVisible();

    // Verify AdSense mention
    const adsenseText = page.getByText(/Google AdSense/);
    await expect(adsenseText.first()).toBeVisible();
  });

  test('プライバシーポリシーに必須コンテンツが含まれている', async ({ page }) => {
    // Check Cookie section
    const cookieSection = page.getByRole('heading', {
      name: /Cookie（クッキー）について/,
      level: 2,
    });
    await expect(cookieSection).toBeVisible();

    // Check data handling section
    const dataSection = page.getByRole('heading', { name: /データの取り扱い/, level: 2 });
    await expect(dataSection).toBeVisible();

    // Verify contact link exists
    const contactLink = page.getByRole('link', { name: /forms\.gle/ });
    await expect(contactLink).toBeVisible();
  });

  test('プライバシーポリシーページがレスポンシブ対応している', async ({ page }) => {
    // Test desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    const heading = page.getByRole('heading', { name: 'プライバシーポリシー', level: 1 });
    await expect(heading).toBeVisible();

    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(heading).toBeVisible();
  });

  test('ヘッダーとフッターが表示される', async ({ page }) => {
    // Check header
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check footer
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });
});

test.describe('Terms of Service Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/terms');
    await dismissMigrationDialogIfVisible(page);
  });

  test('利用規約ページが正しく表示される', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/利用規約 - Tools/);

    // Check main heading
    const heading = page.getByRole('heading', { name: '利用規約', level: 1 });
    await expect(heading).toBeVisible();

    // Check first section
    const firstSection = page.getByRole('heading', { name: /第1条（適用）/, level: 2 });
    await expect(firstSection).toBeVisible();
  });

  test('利用規約に必須コンテンツが含まれている', async ({ page }) => {
    // Check service description
    const serviceText = page.getByText(/本サービス/);
    await expect(serviceText.first()).toBeVisible();

    // Check disclaimer section
    const disclaimerSection = page.getByRole('heading', {
      name: /保証の否認および免責事項/,
      level: 2,
    });
    await expect(disclaimerSection).toBeVisible();

    // Check prohibited actions section
    const prohibitedSection = page.getByRole('heading', { name: /禁止事項/, level: 2 });
    await expect(prohibitedSection).toBeVisible();
  });

  test('利用規約ページがレスポンシブ対応している', async ({ page }) => {
    // Test desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    const heading = page.getByRole('heading', { name: '利用規約', level: 1 });
    await expect(heading).toBeVisible();

    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(heading).toBeVisible();
  });

  test('ヘッダーとフッターが表示される', async ({ page }) => {
    // Check header
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check footer
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });
});

test.describe('About Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await dismissMigrationDialogIfVisible(page);
  });

  test('Aboutページが正しく表示される', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Tools について - Tools/);

    // Check main heading
    const heading = page.getByRole('heading', { name: 'Tools について', level: 1 });
    await expect(heading).toBeVisible();
  });

  test('Aboutページに必須コンテンツが含まれている', async ({ page }) => {
    // Check purpose section
    const purposeSection = page.getByRole('heading', { name: /サイトの目的/, level: 2 });
    await expect(purposeSection).toBeVisible();

    // Check tools section
    const toolsSection = page.getByRole('heading', { name: /提供ツール/, level: 2 });
    await expect(toolsSection).toBeVisible();

    // Verify transit converter is mentioned
    const transitText = page.getByText(/乗り換え変換ツール/);
    await expect(transitText).toBeVisible();

    // Check tech stack section
    const techSection = page.getByRole('heading', { name: /技術スタック/, level: 2 });
    await expect(techSection).toBeVisible();

    // Verify Next.js is mentioned
    const nextjsText = page.getByText(/Next\.js/);
    await expect(nextjsText).toBeVisible();

    // Check developer section
    const devSection = page.getByRole('heading', { name: /開発者/, level: 2 });
    await expect(devSection).toBeVisible();

    // Verify GitHub link exists
    const githubLink = page.getByRole('link', { name: /nagiyu-platform/ });
    await expect(githubLink).toBeVisible();
    await expect(githubLink).toHaveAttribute('href', /github\.com/);
  });

  test('Aboutページがレスポンシブ対応している', async ({ page }) => {
    // Test desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    const heading = page.getByRole('heading', { name: 'Tools について', level: 1 });
    await expect(heading).toBeVisible();

    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(heading).toBeVisible();
  });

  test('ヘッダーとフッターが表示される', async ({ page }) => {
    // Check header
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check footer
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });
});

test.describe('Contact Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
    await dismissMigrationDialogIfVisible(page);
  });

  test('お問い合わせページが正しく表示される', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/お問い合わせ - Tools/);

    // Check main heading
    const heading = page.getByRole('heading', { name: 'お問い合わせ', level: 1 });
    await expect(heading).toBeVisible();
  });

  test('お問い合わせページに必須コンテンツが含まれている', async ({ page }) => {
    // Check contact method section
    const methodSection = page.getByRole('heading', { name: /お問い合わせ方法/, level: 2 });
    await expect(methodSection).toBeVisible();

    // Verify GitHub Issues link
    const githubIssuesLink = page.getByRole('link', { name: /GitHub Issues/ });
    await expect(githubIssuesLink).toBeVisible();
    await expect(githubIssuesLink).toHaveAttribute('href', /github\.com.*\/issues/);

    // Check other contact section
    const otherSection = page.getByRole('heading', { name: /その他のお問い合わせ/, level: 2 });
    await expect(otherSection).toBeVisible();

    // Verify contact form link
    const formLink = page.getByRole('link', { name: /お問い合わせフォーム/ });
    await expect(formLink).toBeVisible();
    await expect(formLink).toHaveAttribute('href', /forms\.gle/);

    // Check notes section
    const notesSection = page.getByRole('heading', { name: /注意事項/, level: 2 });
    await expect(notesSection).toBeVisible();
  });

  test('お問い合わせページがレスポンシブ対応している', async ({ page }) => {
    // Test desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    const heading = page.getByRole('heading', { name: 'お問い合わせ', level: 1 });
    await expect(heading).toBeVisible();

    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(heading).toBeVisible();
  });

  test('ヘッダーとフッターが表示される', async ({ page }) => {
    // Check header
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check footer
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });
});

test.describe('Required Pages - Common Features', () => {
  test('すべての必須ページが存在する', async ({ page }) => {
    // Check Privacy page
    await page.goto('/privacy');
    await dismissMigrationDialogIfVisible(page);
    await expect(page).toHaveTitle(/プライバシーポリシー/);

    // Check Terms page
    await page.goto('/terms');
    await dismissMigrationDialogIfVisible(page);
    await expect(page).toHaveTitle(/利用規約/);

    // Check About page
    await page.goto('/about');
    await dismissMigrationDialogIfVisible(page);
    await expect(page).toHaveTitle(/Tools について/);

    // Check Contact page
    await page.goto('/contact');
    await dismissMigrationDialogIfVisible(page);
    await expect(page).toHaveTitle(/お問い合わせ/);
  });

  test('すべてのページでヘッダーからホームに戻れる', async ({ page }) => {
    const pages = ['/privacy', '/terms', '/about', '/contact'];

    for (const pagePath of pages) {
      // Navigate to page
      await page.goto(pagePath);
      await dismissMigrationDialogIfVisible(page);

      // Click header link to go home
      const headerLink = page.getByRole('link', { name: /Tools ホームページに戻る/ });
      await expect(headerLink).toBeVisible();
      await headerLink.click();

      // Verify we're back on home page
      await expect(page).toHaveURL('/');
      await dismissMigrationDialogIfVisible(page);
      const homeHeading = page.getByRole('heading', { name: /ツール一覧/ });
      await expect(homeHeading).toBeVisible();
    }
  });

  test('すべてのページでフッターのリンクが機能する', async ({ page }) => {
    const pages = ['/privacy', '/terms', '/about', '/contact'];

    for (const pagePath of pages) {
      // Navigate to page
      await page.goto(pagePath);
      await dismissMigrationDialogIfVisible(page);

      // Verify footer links exist
      const footer = page.locator('footer');
      await expect(footer).toBeVisible();

      const privacyButton = footer.getByRole('button', { name: 'プライバシーポリシー' });
      await expect(privacyButton).toBeVisible();

      const termsButton = footer.getByRole('button', { name: '利用規約' });
      await expect(termsButton).toBeVisible();
    }
  });
});

test.describe('Required Pages - SEO and Metadata', () => {
  test('プライバシーポリシーページに適切なメタデータが設定されている', async ({ page }) => {
    await page.goto('/privacy');
    await dismissMigrationDialogIfVisible(page);

    // Check title
    await expect(page).toHaveTitle(/プライバシーポリシー - Tools/);

    // Check meta description (if it exists)
    const metaDescription = page.locator('meta[name="description"]');
    if ((await metaDescription.count()) > 0) {
      const content = await metaDescription.getAttribute('content');
      expect(content).toBeTruthy();
    }
  });

  test('利用規約ページに適切なメタデータが設定されている', async ({ page }) => {
    await page.goto('/terms');
    await dismissMigrationDialogIfVisible(page);

    // Check title
    await expect(page).toHaveTitle(/利用規約 - Tools/);

    // Check meta description (if it exists)
    const metaDescription = page.locator('meta[name="description"]');
    if ((await metaDescription.count()) > 0) {
      const content = await metaDescription.getAttribute('content');
      expect(content).toBeTruthy();
    }
  });

  test('Aboutページに適切なメタデータが設定されている', async ({ page }) => {
    await page.goto('/about');
    await dismissMigrationDialogIfVisible(page);

    // Check title
    await expect(page).toHaveTitle(/Tools について - Tools/);

    // Check meta description (if it exists)
    const metaDescription = page.locator('meta[name="description"]');
    if ((await metaDescription.count()) > 0) {
      const content = await metaDescription.getAttribute('content');
      expect(content).toBeTruthy();
    }
  });

  test('お問い合わせページに適切なメタデータが設定されている', async ({ page }) => {
    await page.goto('/contact');
    await dismissMigrationDialogIfVisible(page);

    // Check title
    await expect(page).toHaveTitle(/お問い合わせ - Tools/);

    // Check meta description (if it exists)
    const metaDescription = page.locator('meta[name="description"]');
    if ((await metaDescription.count()) > 0) {
      const content = await metaDescription.getAttribute('content');
      expect(content).toBeTruthy();
    }
  });
});
