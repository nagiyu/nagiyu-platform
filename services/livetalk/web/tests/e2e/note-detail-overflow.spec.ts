import { test, expect, type Locator } from '@playwright/test';

/**
 * SCR ノート詳細（/notes/[id]）の長い文字列の表示
 *
 * 詳細が叩く `/api/notes/:id` をモックし、空白を含まない長い件名・調べた内容・出典 URL が
 * 狭い画面でページを横に広げたり、親の要素の右端を越えたりしないことを検証する。
 */

const MOBILE_WIDTH = 390;
const NOTE_ID = 'note-long-text';

const LONG_SUBJECT = `${'とても長い件名'.repeat(4)}${'subject'.repeat(12)}`;
const LONG_FACT = `${'fact'.repeat(40)}${'調べた内容'.repeat(6)}`;
const LONG_SOURCE_URL = `https://example.com/${'long-path-segment'.repeat(8)}`;
const LONG_HEADLINE = `${'headline'.repeat(30)}`;

/**
 * 要素の中身が実際に描画されている右端を返す。
 * ブロック要素の枠は親の幅に固定されるため、あふれた文字は枠ではなく Range の矩形でしか測れない。
 */
async function getContentRight(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Math.max(...Array.from(range.getClientRects()).map((rect) => rect.right));
  });
}

test.describe('LiveTalk - ノート詳細の長い文字列', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: 844 });
    await page.route(`**/api/notes/${NOTE_ID}`, (route) =>
      route.fulfill({
        json: {
          note: {
            id: NOTE_ID,
            subject: LONG_SUBJECT,
            sharedAt: Date.UTC(2026, 0, 1),
            headline: LONG_HEADLINE,
            webFacts: [LONG_FACT],
            sources: [LONG_SOURCE_URL],
          },
        },
      })
    );
    await page.goto(`/notes/${NOTE_ID}`);
    await expect(page.getByRole('heading', { name: LONG_SUBJECT })).toBeVisible();
  });

  test('ページが横に広がらない', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE_WIDTH);
  });

  test('件名・調べた内容・出典 URL が記事の右端を越えない', async ({ page }) => {
    const articleBox = await page.getByRole('article').boundingBox();
    if (!articleBox) {
      throw new Error('記事の位置を取得できませんでした');
    }
    const articleRight = articleBox.x + articleBox.width;

    const targets = [
      page.getByRole('heading', { name: LONG_SUBJECT }),
      page.getByText(LONG_HEADLINE),
      page.getByText(LONG_FACT),
      page.getByRole('link', { name: LONG_SOURCE_URL }),
    ];
    for (const target of targets) {
      expect(await getContentRight(target)).toBeLessThanOrEqual(articleRight + 1);
    }
  });
});
