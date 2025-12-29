import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should display sign-in page', async ({ page }) => {
    await page.goto('/signin');

    // Check page title
    await expect(page.getByRole('heading', { name: 'Nagiyu Platform' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '認証サービス' })).toBeVisible();

    // Check sign-in button is present
    await expect(page.getByRole('button', { name: /Google でサインイン/ })).toBeVisible();
  });

  test('should redirect unauthenticated user to sign-in', async ({ page }) => {
    // Try to access protected route
    await page.goto('/dashboard');

    // Should be redirected to sign-in page
    await expect(page).toHaveURL(/\/signin/);
    await expect(page.getByRole('heading', { name: 'Nagiyu Platform' })).toBeVisible();
  });

  test('should redirect root to sign-in when not authenticated', async ({ page }) => {
    await page.goto('/');

    // Should be redirected to sign-in page
    await expect(page).toHaveURL(/\/signin/);
    await expect(page.getByRole('heading', { name: 'Nagiyu Platform' })).toBeVisible();
  });

  test('should display error page with error message', async ({ page }) => {
    await page.goto('/auth/error?error=AccessDenied');

    // Check error page content
    await expect(page.getByRole('heading', { name: '認証エラー' })).toBeVisible();
    await expect(page.getByText('アクセスが拒否されました')).toBeVisible();
    await expect(page.getByText('エラーコード: AccessDenied')).toBeVisible();

    // Check back to sign-in button
    await expect(page.getByRole('link', { name: 'サインインページへ戻る' })).toBeVisible();
  });

  test('health check endpoint should work', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');
  });
});

// Note: Full OAuth flow testing requires mocking Google OAuth or using test credentials
// For now, we test the UI elements and navigation
test.describe('OAuth Button Interaction', () => {
  test('sign-in button should be clickable', async ({ page }) => {
    await page.goto('/signin');

    const signInButton = page.getByRole('button', { name: /Google でサインイン/ });
    await expect(signInButton).toBeVisible();
    await expect(signInButton).toBeEnabled();

    // Note: Actually clicking will redirect to Google OAuth, which we can't test without credentials
    // In a real E2E test with credentials, you would:
    // 1. Click the button
    // 2. Fill in Google credentials
    // 3. Verify redirect to dashboard
    // 4. Check session information
  });
});
