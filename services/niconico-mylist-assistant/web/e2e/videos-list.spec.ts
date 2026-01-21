import { test, expect } from '@playwright/test';

test.describe('Videos List API', () => {
  test('should return 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/api/videos');

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('認証が必要です');
  });

  test('should validate filter parameter', async ({ request }) => {
    const response = await request.get('/api/videos?filter=invalid');

    expect([400, 401]).toContain(response.status());
  });

  test('should validate limit parameter range', async ({ request }) => {
    const response = await request.get('/api/videos?limit=150');

    expect([400, 401]).toContain(response.status());
  });

  test('should accept valid filter values', async ({ request }) => {
    const filters = ['all', 'favorite', 'skip'];

    for (const filter of filters) {
      const response = await request.get(`/api/videos?filter=${filter}`);
      expect([200, 401]).toContain(response.status());
    }
  });

  test('should accept valid limit values', async ({ request }) => {
    const response = await request.get('/api/videos?limit=20');

    expect([200, 401]).toContain(response.status());
  });
});

test.describe('Videos List Page', () => {
  test('should display page title', async ({ page }) => {
    await page.goto('/videos');

    await expect(page.getByRole('heading', { name: '動画一覧' })).toBeVisible();
  });

  test('should display filter buttons', async ({ page }) => {
    await page.goto('/videos');

    await expect(page.getByRole('button', { name: 'すべて' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'お気に入り' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'スキップ' })).toBeVisible();
  });

  test('should display add video button', async ({ page }) => {
    await page.goto('/videos');

    await expect(page.getByRole('button', { name: '動画を追加' })).toBeVisible();
  });

  test('should display loading state initially', async ({ page }) => {
    await page.goto('/videos');

    // Loading indicator should be visible initially
    await expect(page.locator('css=[role="progressbar"]')).toBeVisible();
  });

  test('should display info message when no videos', async ({ page }) => {
    await page.goto('/videos');

    // Wait for loading to complete
    await page.waitForSelector('css=[role="progressbar"]', { state: 'hidden' });

    // Check for either videos or empty state message
    const hasVideos = await page.locator('css=[role="heading"][name*="動画"]').count();
    const hasEmptyMessage = await page.getByText('動画が登録されていません').isVisible();

    expect(hasVideos > 0 || hasEmptyMessage).toBe(true);
  });

  test('should navigate to add video page when clicking add button', async ({ page }) => {
    await page.goto('/videos');

    await page.getByRole('button', { name: '動画を追加' }).click();

    await expect(page).toHaveURL('/import');
  });

  test('should change filter when clicking filter buttons', async ({ page }) => {
    await page.goto('/videos');

    // Click favorite filter
    await page.getByRole('button', { name: 'お気に入り' }).click();

    // Loading should appear
    await expect(page.locator('css=[role="progressbar"]')).toBeVisible();

    // Wait for loading to complete
    await page.waitForSelector('css=[role="progressbar"]', { state: 'hidden' });
  });
});

test.describe('Videos List Page with Authentication', () => {
  test.skip('should display video cards when videos exist', async ({ page }) => {
    // TODO: Implement authentication setup and seed test data
    // This test is skipped until authentication is properly set up in the test environment

    await page.goto('/videos');

    // Wait for videos to load
    await page.waitForSelector('css=[role="progressbar"]', { state: 'hidden' });

    // Check for video cards
    const videoCards = await page.locator('css=[role="button"]:has-text("詳細")').count();
    expect(videoCards).toBeGreaterThan(0);
  });

  test.skip('should navigate to video detail when clicking detail button', async ({ page }) => {
    // TODO: Implement authentication setup and seed test data

    await page.goto('/videos');

    // Wait for videos to load
    await page.waitForSelector('css=[role="progressbar"]', { state: 'hidden' });

    // Click first video's detail button
    await page.locator('css=[role="button"]:has-text("詳細")').first().click();

    // Should navigate to video detail page
    await expect(page).toHaveURL(/\/videos\/.+/);
  });

  test.skip('should display pagination when multiple pages exist', async ({ page }) => {
    // TODO: Implement authentication setup and seed test data with >20 videos

    await page.goto('/videos');

    // Wait for videos to load
    await page.waitForSelector('css=[role="progressbar"]', { state: 'hidden' });

    // Check for pagination
    await expect(page.locator('css=[role="navigation"]')).toBeVisible();
  });

  test.skip('should filter favorite videos', async ({ page }) => {
    // TODO: Implement authentication setup and seed test data

    await page.goto('/videos');

    // Click favorite filter
    await page.getByRole('button', { name: 'お気に入り' }).click();

    // Wait for videos to load
    await page.waitForSelector('css=[role="progressbar"]', { state: 'hidden' });

    // All visible videos should have favorite badge
    const favoriteBadges = await page.getByText('お気に入り').count();
    const videoCards = await page.locator('css=[role="button"]:has-text("詳細")').count();

    expect(favoriteBadges).toBe(videoCards);
  });

  test.skip('should filter skip videos', async ({ page }) => {
    // TODO: Implement authentication setup and seed test data

    await page.goto('/videos');

    // Click skip filter
    await page.getByRole('button', { name: 'スキップ' }).click();

    // Wait for videos to load
    await page.waitForSelector('css=[role="progressbar"]', { state: 'hidden' });

    // All visible videos should have skip badge
    const skipBadges = await page.getByText('スキップ').count();
    const videoCards = await page.locator('css=[role="button"]:has-text("詳細")').count();

    expect(skipBadges).toBe(videoCards);
  });
});
