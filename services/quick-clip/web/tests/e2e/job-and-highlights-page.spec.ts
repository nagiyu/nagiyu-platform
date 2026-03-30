import { expect, test } from '@playwright/test';

test.describe('QuickClip Job Page', () => {
  test.use({ serviceWorkers: 'block' });

  test('処理完了ジョブで見どころ確認画面へ遷移できる', async ({ page }) => {
    await page.route('**/api/jobs/e2e-job-completed**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'e2e-job-completed',
          status: 'COMPLETED',
          originalFileName: 'movie.mp4',
          fileSize: 1024,
          createdAt: Date.now(),
          expiresAt: Date.now() + 86400 * 1000,
        }),
      });
    });

    await page.goto('/jobs/e2e-job-completed');

    await expect(page.getByRole('heading', { level: 1, name: '処理中画面' })).toBeVisible();
    await expect(page.getByText('処理完了')).toBeVisible();
    await page.getByRole('link', { name: '見どころを確認する' }).click();
    await expect(page).toHaveURL(/\/jobs\/e2e-job-completed\/highlights$/);
  });
});

test.describe('QuickClip Highlights Page', () => {
  test.use({ serviceWorkers: 'block' });

  test('見どころ一覧を表示して採否更新・ダウンロード実行ができる', async ({ page }) => {
    const highlights = [
      {
        highlightId: 'h-1',
        jobId: 'e2e-job-highlights',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'accepted',
        previewUrl: 'https://example.com/preview-h-1.mp4',
      },
      {
        highlightId: 'h-2',
        jobId: 'e2e-job-highlights',
        order: 2,
        startSec: 30,
        endSec: 45,
        status: 'rejected',
        previewUrl: 'https://example.com/preview-h-2.mp4',
      },
    ];

    await page.route('**/api/jobs/e2e-job-highlights/highlights', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          highlights,
          sourceVideoUrl: 'https://example.com/source.mp4',
        }),
      });
    });

    await page.route('**/api/jobs/e2e-job-highlights/highlights/**', async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as {
        startSec?: number;
        endSec?: number;
        status?: 'accepted' | 'rejected' | 'pending';
      };
      const requestUrl = new URL(request.url());
      const highlightId = requestUrl.pathname.split('/').at(-1) ?? '';
      const current = highlights.find((item) => item.highlightId === highlightId);

      if (!current) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'not found' }),
        });
        return;
      }

      const updated = {
        ...current,
        ...body,
      };
      const targetIndex = highlights.findIndex((item) => item.highlightId === highlightId);
      if (targetIndex < 0) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'not found' }),
        });
        return;
      }
      highlights[targetIndex] = updated;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
    });

    await page.route('**/api/jobs/e2e-job-highlights/download', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'e2e-job-highlights',
          fileName: 'e2e-job-highlights-clips.zip',
          downloadUrl: 'data:text/plain;base64,ZmFrZS16aXA=',
        }),
      });
    });

    await page.goto('/jobs/e2e-job-highlights/highlights');

    await expect(page.getByRole('heading', { level: 1, name: '見どころ確認画面' })).toBeVisible();
    await expect(page.getByText('採用中の見どころ: 1 件')).toBeVisible();
    await expect(page.locator('video')).toHaveAttribute('src', 'https://example.com/source.mp4');

    await page.getByRole('checkbox', { name: /見どころ2.*使える/ }).click();
    await expect(page.getByText('採用中の見どころ: 2 件')).toBeVisible();

    await page.getByRole('button', { name: 'ZIP ダウンロード' }).click();
    await expect(page.getByRole('button', { name: 'ZIP ダウンロード' })).toBeEnabled();
  });
});
