import { test, expect, type Locator } from '@playwright/test';

const MOBILE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;

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

test.describe('ユーザー一覧 (スマホ幅)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: 844 });
    await page.route('**/api/users?*', (route) =>
      route.fulfill({ json: { users: USERS, hasMore: false } })
    );
    await page.goto('/dashboard/users');
    await expect(page.getByTestId('users-cards').getByText(SHORT_EMAIL)).toBeVisible();
  });

  test('カードで出て、表は見えず、ページも横に広がらない', async ({ page }) => {
    await expect(page.getByTestId('users-cards')).toBeVisible();
    await expect(page.getByTestId('users-table')).toBeHidden();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE_WIDTH);
  });

  test('長いメールアドレスは折り返され、カードの幅を超えない', async ({ page }) => {
    const longEmail = page.getByTestId('users-cards').getByText(LONG_EMAIL);
    expect(await countTextLines(longEmail)).toBeGreaterThan(1);

    const viewport = page.viewportSize();
    const box = await longEmail.boundingBox();
    if (!box || !viewport) {
      throw new Error('メールアドレスの位置を取得できませんでした');
    }
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });

  test('各ユーザーのロールと編集ボタンが画面内に見える', async ({ page }) => {
    const cards = page.getByTestId('users-cards');
    await expect(cards.getByText('管理者')).toBeVisible();
    await expect(cards.getByText('なし')).toBeVisible();

    const editLinks = await cards.getByRole('link', { name: '編集' }).all();
    expect(editLinks).toHaveLength(USERS.length);
    for (const editLink of editLinks) {
      await expect(editLink).toBeInViewport({ ratio: 1 });
      const box = await editLink.boundingBox();
      if (!box) {
        throw new Error('編集ボタンの位置を取得できませんでした');
      }
      expect(box.x + box.width).toBeLessThanOrEqual(MOBILE_WIDTH);
      expect(await countTextLines(editLink)).toBe(1);
    }
  });
});

test.describe('ユーザー一覧 (PC 幅)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: DESKTOP_WIDTH, height: 900 });
    await page.route('**/api/users?*', (route) =>
      route.fulfill({ json: { users: USERS, hasMore: false } })
    );
    await page.goto('/dashboard/users');
    await expect(page.getByTestId('users-table').getByText(SHORT_EMAIL)).toBeVisible();
  });

  test('表で出て、カードは見えない', async ({ page }) => {
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByTestId('users-cards')).toBeHidden();
  });

  test('長いメールアドレスは折り返され、短いものは途中で割れない', async ({ page }) => {
    const table = page.getByTestId('users-table');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(DESKTOP_WIDTH);

    expect(await countTextLines(table.getByRole('cell', { name: SHORT_EMAIL }))).toBe(1);
    for (const header of await table.getByRole('columnheader').all()) {
      expect(await countTextLines(header)).toBe(1);
    }
  });
});
