import { expect, test } from '@playwright/test';
import { resetTestData, TEST_USER } from './helpers/test-data';

test.describe('個人 ToDo 管理', () => {
  test.beforeEach(async ({ page, request }) => {
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
          todoId: 'todo-1',
          listId: 'list-default',
          title: 'E2E 未完了 ToDo',
          isCompleted: false,
          createdBy: TEST_USER.userId,
        },
        {
          todoId: 'todo-2',
          listId: 'list-default',
          title: 'E2E 完了済み ToDo',
          isCompleted: true,
          createdBy: TEST_USER.userId,
          completedBy: TEST_USER.userId,
        },
      ],
    });

    await page.goto('/lists?listId=list-default');
    await expect(page.getByText('E2E 未完了 ToDo')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'タイトル' })).toBeVisible();
  });

  test('ToDo を追加できる', async ({ page }) => {
    const todoTitle = `E2E 追加テスト ${Date.now()}`;

    await page.getByRole('textbox', { name: 'タイトル' }).fill(todoTitle);
    await page.getByRole('button', { name: '追加' }).click();

    await expect(page.getByText(todoTitle)).toBeVisible();
    await expect(page.getByText('ToDoを追加しました。')).toBeVisible();
  });

  test('ToDo を完了にできる', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', { name: 'E2E 未完了 ToDoの完了チェック' });
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  });

  test('ToDo を編集できる', async ({ page }) => {
    const currentTitle = 'E2E 未完了 ToDo';
    const updatedTitle = `E2E 編集後 ToDo ${Date.now()}`;

    const todoRow = page.getByRole('listitem').filter({ hasText: currentTitle });
    await todoRow.getByRole('button', { name: '編集' }).click();
    await page.getByRole('textbox', { name: 'タイトルを編集' }).fill(updatedTitle);
    await page.getByRole('button', { name: '保存' }).click();

    await expect(page.getByText(updatedTitle)).toBeVisible();
    await expect(page.getByText(currentTitle)).toHaveCount(0);
    await expect(page.getByText('ToDoを更新しました。')).toBeVisible();
  });

  test('ToDo を削除できる', async ({ page }) => {
    const todoTitle = `E2E 削除テスト ${Date.now()}`;

    await page.getByRole('textbox', { name: 'タイトル' }).fill(todoTitle);
    await page.getByRole('button', { name: '追加' }).click();
    await expect(page.getByText(todoTitle)).toBeVisible();

    const todoRow = page.getByRole('listitem').filter({ hasText: todoTitle });
    await todoRow.getByRole('button', { name: '削除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除' }).click();

    await expect(page.getByText(todoTitle)).not.toBeVisible();
  });
});
