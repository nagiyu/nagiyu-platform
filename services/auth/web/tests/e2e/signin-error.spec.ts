import { expect, test } from '@playwright/test';

const DEFAULT_MESSAGE = 'サインインに失敗しました。もう一度お試しください。';

test.describe('サインイン画面の error 表示', () => {
  test('error=MissingCSRF で対応する文を表示する', async ({ page }) => {
    await page.goto('/signin?error=MissingCSRF');

    await expect(page.getByRole('alert')).toHaveText(
      '操作の確認に失敗しました。画面を開き直してから、もう一度お試しください。'
    );
    await expect(page.getByRole('button', { name: /Google でサインイン/ })).toBeVisible();
  });

  test('error が無ければ表示しない', async ({ page }) => {
    await page.goto('/signin');

    await expect(page.getByRole('button', { name: /Google でサインイン/ })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // Object 自身のプロパティ名を渡しても、画面が落ちず既定の文を出す
  for (const error of ['__proto__', 'constructor', 'toString']) {
    test(`error=${error} でも例外を出さず既定の文を表示する`, async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', (e) => pageErrors.push(e));

      await page.goto(`/signin?error=${error}`);

      await expect(page.getByRole('alert')).toHaveText(DEFAULT_MESSAGE);
      expect(pageErrors).toEqual([]);
    });
  }
});
