import { test, expect } from '@playwright/test';

// AWS タグを持つ記事は同タグの記事が他にもあるため、関連記事が必ず出る
const ARTICLE_PATH = '/tech/cdk-cross-stack-ssm-parameter-store';
const MARKER = '__clientNavigationMarker';

test.describe('記事ページの関連記事', () => {
  test('関連記事のカードを押すとページを読み込み直さずに遷移する', async ({ page }) => {
    await page.goto(ARTICLE_PATH);

    const card = page.locator('h2:has-text("関連記事") ~ div a[href^="/tech/"]').first();
    await expect(card).toBeVisible();
    const href = await card.getAttribute('href');
    expect(href).not.toBeNull();

    // 全体の読み込み直しが起きると window の値は消えるため、クライアント側遷移の判定に使う
    await page.evaluate((key) => {
      (window as unknown as Record<string, unknown>)[key] = true;
    }, MARKER);

    await card.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    const kept = await page.evaluate(
      (key) => (window as unknown as Record<string, unknown>)[key] === true,
      MARKER
    );
    expect(kept).toBe(true);
  });
});
