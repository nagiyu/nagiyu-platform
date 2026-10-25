import { expect, test } from '@playwright/test';

const DEFAULT_MESSAGE = '認証中にエラーが発生しました。もう一度お試しください。';

test.describe('認証エラー画面のクエリ処理', () => {
  // Object 自身のプロパティ名をクエリに渡しても、画面が落ちず既定メッセージを出す
  for (const error of ['__proto__', 'constructor', 'toString']) {
    test(`error=${error} でも例外を出さず既定メッセージを表示する`, async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', (e) => pageErrors.push(e));

      await page.goto(`/auth/error?error=${error}`);

      await expect(page.getByRole('heading', { name: '認証エラー' })).toBeVisible();
      await expect(page.getByText(DEFAULT_MESSAGE)).toBeVisible();
      await expect(page.getByRole('link', { name: 'サインインページへ戻る' })).toBeVisible();
      expect(pageErrors).toEqual([]);
    });
  }
});
