import { test, expect } from '@playwright/test';

test.describe('/mylist/status/[jobId]', () => {
  test('ジョブ確認画面がクライアント例外なしで表示される', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.route('**/api/batch/status/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'RUNNING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto('/mylist/status/test-job-id');

    await expect(page.getByRole('heading', { name: 'ジョブステータス', level: 1 })).toBeVisible();
    await expect(page.getByText('ジョブID: test-job-id')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
