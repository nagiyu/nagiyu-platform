import { test, expect, type Locator } from '@playwright/test';

const MOBILE_WIDTH = 390;

const LONG_EMAIL = `${'a'.repeat(80)}@${'example'.repeat(8)}.com`;
const SHORT_EMAIL = 'taro@example.com';

const USERS = [
  {
    userId: 'user-long',
    googleId: 'google-long',
    email: LONG_EMAIL,
    name: '長いメールアドレスのユーザー',
    roles: ['admin'],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    userId: 'user-short',
    googleId: 'google-short',
    email: SHORT_EMAIL,
    name: '山田太郎',
    roles: [],
    createdAt: 0,
    updatedAt: 0,
  },
];

/** 要素内のテキストが画面上で占める行数を数える（途中で割れているかを判定するため） */
async function countTextLines(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)));
    return tops.size;
  });
}

test.describe('ユーザー一覧の長い文字列', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: 844 });
    await page.route('**/api/users?*', (route) =>
      route.fulfill({ json: { users: USERS, hasMore: false } })
    );
    await page.goto('/dashboard/users');
    await expect(page.getByText(SHORT_EMAIL)).toBeVisible();
  });

  test('長いメールアドレスは折り返され、ページも表も横に広がらない', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE_WIDTH);

    const longEmailCell = page.getByRole('cell', { name: LONG_EMAIL });
    expect(await countTextLines(longEmailCell)).toBeGreaterThan(1);

    // 折り返されなければメールアドレスの列だけで 700px 近くになり、他の列を押し出す
    const cellBox = await longEmailCell.boundingBox();
    if (!cellBox) {
      throw new Error('メールアドレスのセルの位置を取得できませんでした');
    }
    expect(cellBox.width).toBeLessThanOrEqual(300);
  });

  test('編集ボタンが表の右端を越えない', async ({ page }) => {
    const tableBox = await page.getByRole('table').boundingBox();
    if (!tableBox) {
      throw new Error('表の位置を取得できませんでした');
    }

    for (const editLink of await page.getByRole('link', { name: '編集' }).all()) {
      const box = await editLink.boundingBox();
      if (!box) {
        throw new Error('編集ボタンの位置を取得できませんでした');
      }
      expect(box.x + box.width).toBeLessThanOrEqual(tableBox.x + tableBox.width);
    }
  });

  test('短いメールアドレス・見出し・編集ボタンは途中で割れない', async ({ page }) => {
    expect(await countTextLines(page.getByRole('cell', { name: SHORT_EMAIL }))).toBe(1);

    for (const header of await page.getByRole('columnheader').all()) {
      expect(await countTextLines(header)).toBe(1);
    }

    for (const editLink of await page.getByRole('link', { name: '編集' }).all()) {
      expect(await countTextLines(editLink)).toBe(1);
    }
  });

  test('名前の列が最小幅を保つ', async ({ page }) => {
    const nameCell = page.getByRole('cell', { name: '山田太郎' });
    const { width, fontSize } = await nameCell.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      fontSize: parseFloat(getComputedStyle(element).fontSize),
    }));
    // 最小幅が無いと、他の列に幅を取られて名前が 1 文字ずつ割れるほど潰される
    expect(width).toBeGreaterThanOrEqual(fontSize * 6);
  });
});
