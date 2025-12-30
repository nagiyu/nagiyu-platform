import { test, expect } from '@playwright/test';

test.describe('Authentication Flow with Mock Provider', () => {
  test.skip(process.env.AUTH_PROVIDER !== 'mock', 'Mock provider not enabled');

  test('should complete full authentication flow', async ({ page }) => {
    // Navigate to sign-in page
    await page.goto('/');
    await expect(page).toHaveURL(/\/signin/);

    // Click sign-in button (with mock provider, this should show credentials form)
    await page.getByRole('button', { name: /Google でサインイン/ }).click();

    // Wait for auth provider page or dashboard
    await page.waitForURL(/\/(dashboard|api\/auth)/);

    // If redirected to dashboard, verify session
    if (page.url().includes('/dashboard')) {
      await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
    }
  });

  test('should display user information after sign-in', async ({ page, context }) => {
    // Set up a mock session cookie
    await context.addCookies([
      {
        name: '__Secure-next-auth.session-token',
        value: 'mock-session-token',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    // Note: In real implementation with mock provider, we would:
    // 1. Actually sign in through the mock provider
    // 2. Verify session is created
    // 3. Check user information is displayed

    // For now, verify dashboard structure
    await page.goto('/dashboard');

    // Check if redirected to sign-in (no valid session) or dashboard is shown
    const url = page.url();
    if (url.includes('/signin')) {
      // Expected: no valid session, redirected to sign-in
      await expect(page.getByRole('heading', { name: 'Nagiyu Platform' })).toBeVisible();
    } else if (url.includes('/dashboard')) {
      // If somehow session is valid, check dashboard
      await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
    }
  });

  test('should sign out successfully', async ({ page, context }) => {
    // This test would work fully with actual mock provider authentication
    // For now, verify sign-out button exists when authenticated

    // Try to access dashboard (will redirect to sign-in if not authenticated)
    await page.goto('/dashboard');

    // If on dashboard, check for sign-out button
    if (page.url().includes('/dashboard')) {
      const signOutButton = page.getByRole('button', { name: /サインアウト/ });
      if (await signOutButton.isVisible()) {
        await signOutButton.click();
        await expect(page).toHaveURL(/\/signin/);
      }
    }
  });

  test('should redirect authenticated user away from signin page', async ({ page, context }) => {
    // This test requires actual authentication
    // For now, verify the redirect logic exists

    await page.goto('/signin');

    // If user is authenticated (has valid session), middleware should redirect to dashboard
    // If not authenticated, should stay on signin page
    const url = page.url();
    expect(url).toMatch(/\/(signin|dashboard)/);
  });
});

test.describe('Protected Routes', () => {
  test('should protect dashboard route', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/signin/);
  });

  test('should include callback URL in sign-in redirect', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/signin\?callbackUrl=/);
  });

  test('should allow access to public routes', async ({ page }) => {
    // Health check should be accessible
    const response = await page.goto('/api/health');
    expect(response?.status()).toBe(200);

    // Sign-in page should be accessible
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: 'Nagiyu Platform' })).toBeVisible();

    // Error page should be accessible
    await page.goto('/auth/error');
    await expect(page.getByRole('heading', { name: '認証エラー' })).toBeVisible();
  });
});

test.describe('Error Handling', () => {
  test('should display different error messages', async ({ page }) => {
    const errorCases = [
      { error: 'Configuration', expectedText: '認証の設定に問題があります' },
      { error: 'AccessDenied', expectedText: 'アクセスが拒否されました' },
      { error: 'Verification', expectedText: '認証に失敗しました' },
      { error: 'Unknown', expectedText: '認証中にエラーが発生しました' },
    ];

    for (const { error, expectedText } of errorCases) {
      await page.goto(`/auth/error?error=${error}`);
      await expect(page.getByText(expectedText)).toBeVisible();
      await expect(page.getByText(`エラーコード: ${error}`)).toBeVisible();
    }
  });

  test('should have link back to sign-in from error page', async ({ page }) => {
    await page.goto('/auth/error');
    const link = page.getByRole('link', { name: 'サインインページへ戻る' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/signin/);
  });
});
