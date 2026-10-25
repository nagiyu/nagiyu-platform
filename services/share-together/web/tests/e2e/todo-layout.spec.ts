import { expect, test, type Locator, type Page } from '@playwright/test';
import { resetTestData, TEST_USER } from './helpers/test-data';

// 日本語は文字間で折り返せるため、折り返しの手がかりが無い英数字にする
const LONG_TITLE = 'abcdefghij'.repeat(15);

const VIEWPORTS = [
  { name: 'スマートフォン幅 (390px)', width: 390, height: 844 },
  { name: 'デスクトップ幅 (1280px)', width: 1280, height: 900 },
] as const;

async function expectInViewport(page: Page, locator: Locator) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport!.width);
}

test.describe('ToDo の長いタイトルのレイアウト', () => {
  test.beforeEach(async ({ request }) => {
    await resetTestData(request, {
      users: [TEST_USER],
      personalLists: [
        {
          listId: 'list-default',
          userId: TEST_USER.userId,
          name: 'デフォルト個人リスト',
          isDefault: true,
        },
      ],
      todos: [
        {
          todoId: 'todo-long',
          listId: 'list-default',
          title: LONG_TITLE,
          isCompleted: false,
          createdBy: TEST_USER.userId,
        },
      ],
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}で長いタイトルでも編集・削除ボタンが画面内に収まる`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/lists?listId=list-default');

      const todoRow = page.getByRole('listitem').filter({ hasText: LONG_TITLE });
      await expect(todoRow).toBeVisible();

      await expectInViewport(page, todoRow.getByRole('button', { name: '編集' }));
      await expectInViewport(page, todoRow.getByRole('button', { name: '削除' }));

      // ページ全体が横に広がっていないこと
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
    });
  }
});
