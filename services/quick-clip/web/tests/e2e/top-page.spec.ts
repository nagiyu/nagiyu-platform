import { test, expect } from '@playwright/test';

test.describe('QuickClip Top Page', () => {
  test('トップページの基本要素を表示する', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'QuickClip' })).toBeVisible();
    await expect(
      page.getByText('Phase 1 では基盤のみを提供します。画面機能は Phase 2 で実装予定です。')
    ).toBeVisible();
  });
});
